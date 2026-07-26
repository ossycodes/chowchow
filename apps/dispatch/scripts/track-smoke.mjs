/**
 * Realtime tracking smoke test — proves live location flows customer↔rider through the
 * gateway. curl can't test WebSockets, so run this instead.
 *
 *   Prereqs: infra up (`pnpm infra:up`) and gateway + identity + catalog + order + dispatch
 *   running WITH `KAFKA_ENABLED=true` on order + dispatch.
 *
 *   Run:  pnpm --filter @chowdeck/dispatch smoke:track
 *   (optional) GATEWAY=http://localhost:3000 pnpm --filter @chowdeck/dispatch smoke:track
 *
 * Exits 0 on success, 1 on failure.
 */
import { io } from "socket.io-client";

const G = process.env.GATEWAY ?? "http://localhost:3000";
const uniq = Date.now();
const die = (m) => {
  console.error("❌ FAIL:", m);
  process.exit(1);
};

const post = async (path, body, token) => {
  const res = await fetch(G + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) die(`POST ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
};
const get = async (path, token) => {
  const res = await fetch(G + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
};

console.log(`→ gateway: ${G}`);

// 1. auth
const email = `smoke${uniq}@example.com`;
await post("/auth/register", { email, password: "supersecret1" });
const { accessToken: token } = await post("/auth/login", {
  email,
  password: "supersecret1",
});
console.log("✓ registered + logged in");

// 2. an ONLINE rider must exist for assignment to succeed
await post("/dispatch/riders", { name: `Smoke ${uniq}`, lat: 6.5, lng: 3.3 }, token);

// 3. a vendor + item (unique slug), then checkout
const { vendor } = await post("/catalog/vendors", { name: `Smoke Kitchen ${uniq}` }, token);
const { item } = await post(
  `/catalog/vendors/${vendor.id}/items`,
  { name: "Jollof", priceKobo: 250000 },
  token,
);
const { order } = await post(
  "/orders",
  { vendorId: vendor.id, items: [{ itemId: item.id, quantity: 1 }] },
  token,
);
console.log(`✓ order created: ${order.id}`);

// 4a. payments charges automatically → wait for CREATED → PAID
let paid = false;
for (let i = 0; i < 20 && !paid; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const o = await get(`/orders/${order.id}`, token);
  paid = o.order.status === "PAID";
}
if (!paid)
  die("order never reached PAID — is the payments service up with KAFKA_ENABLED=true?");
console.log("✓ payments charged the order (auto → PAID)");

// 4b. walk the rest of the way to READY → triggers the dispatch loop
for (const status of ["VENDOR_ACCEPTED", "PREPARING", "READY"])
  await post(`/orders/${order.id}/transition`, { status }, token);
console.log("✓ order walked to READY");

// 5. wait for the async loop to assign a rider (RIDER_ASSIGNED)
let assigned = false;
for (let i = 0; i < 20 && !assigned; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const o = await get(`/orders/${order.id}`, token);
  assigned = o.order.status === "RIDER_ASSIGNED";
}
if (!assigned)
  die("order never reached RIDER_ASSIGNED — is KAFKA_ENABLED=true on order + dispatch?");
console.log("✓ dispatch assigned a rider (async loop closed)");

// 6. open two sockets THROUGH THE GATEWAY and prove live tracking
const timer = setTimeout(() => die("timed out waiting for tracking:location"), 8000);
const customer = io(G, { auth: { token }, transports: ["websocket"] });
const rider = io(G, { auth: { token }, transports: ["websocket"] });
let assignedRiderId = null;

customer.on("connect", () => customer.emit("order:subscribe", { orderId: order.id }));
customer.on("tracking:error", (d) => die("customer: " + d.message));
customer.on("tracking:subscribed", (d) => {
  console.log("✓ customer subscribed to order room; assigned rider:", d.riderId);
  assignedRiderId = d.riderId;
  // stream a position AS the assigned rider
  setTimeout(
    () => rider.emit("rider:location", { riderId: assignedRiderId, lat: 6.6, lng: 3.35 }),
    500,
  );
});
customer.on("tracking:location", (loc) => {
  if (loc.orderId === order.id && loc.riderId === assignedRiderId) {
    console.log("✓ customer received live location:", loc);
    console.log("\n✅ PASS — realtime tracking works end-to-end through the gateway");
    clearTimeout(timer);
    customer.close();
    rider.close();
    process.exit(0);
  }
});
rider.on("tracking:error", (d) => die("rider: " + d.message));
