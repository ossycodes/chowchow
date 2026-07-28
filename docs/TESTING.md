# Full Testing Guide — the whole stack (Phases 0–2)

How to run **everything** locally and test every flow end-to-end: auth, catalog, checkout
(gRPC pricing), the **event-driven dispatch loop** (Kafka), and **realtime tracking**
(WebSockets). Copy-paste friendly, with expected outputs and the gotchas that bite.

> New to the ideas? Read [`eli5/`](eli5/README.md). This guide supersedes the Phase-0
> [`RUNBOOK.md`](RUNBOOK.md) for the current full stack.

---

## 0. What's running

| Process | Port | Role |
|--------|------|------|
| **api-gateway** | 3000 | the single public front door (REST + WS proxy) |
| identity | 3001 | auth: register / login / refresh (JWT + bcrypt) |
| catalog | 3003 (HTTP) · **50051 (gRPC)** | vendors + menu items; internal price API |
| order | 3004 | checkout (gRPC price lookup) + order lifecycle |
| dispatch | 3005 | rider assignment (Kafka) + realtime tracking (Socket.IO) |
| payments | 3006 | charges on order.created → payment.succeeded (order → PAID) |
| ledger | 3007 | double-entry bookkeeping — books payment.succeeded |
| settlements | 3008 | accrues vendor earnings → pays out → settlement.completed |
| notifications | 3002 | welcome-on-registration consumer |

Infra (Docker): **MySQL** 3306, **Redis** 6379, **Redpanda/Kafka** 9092, **Kafka console**
8080, **MySQL console (Adminer)** 8081.

> ⚠️ **The dispatch loop + realtime need real Kafka.** Run `order` and `dispatch` with
> `KAFKA_ENABLED=true`, or their consumers sit idle by design.

---

## 1. One-time setup

```bash
# from the repo root
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
cp .env.example .env            # if you don't already have a .env

pnpm infra:up                   # MySQL, Redis, Redpanda + dashboards
docker ps                       # 5 chowdeck-* containers, healthy

# create each service's tables (database-per-service)
pnpm --filter @chowdeck/identity db:migrate
pnpm --filter @chowdeck/catalog  db:migrate
pnpm --filter @chowdeck/order    db:migrate
pnpm --filter @chowdeck/dispatch db:migrate
pnpm --filter @chowdeck/payments db:migrate
pnpm --filter @chowdeck/ledger   db:migrate
pnpm --filter @chowdeck/settlements db:migrate

pnpm build                      # build all packages (Turbo, dependency-ordered)
```

---

## 2. Run the services

Open **six** terminals (or use your process manager). The gateway/identity/catalog don't
need Kafka; **order and dispatch do**.

```bash
# 1) gateway            2) identity            3) catalog (HTTP + gRPC)
node apps/api-gateway/dist/main.js
node apps/identity/dist/main.js
node apps/catalog/dist/main.js

# 4) order   — KAFKA ON
KAFKA_ENABLED=true node apps/order/dist/main.js
# 5) dispatch — KAFKA ON
KAFKA_ENABLED=true node apps/dispatch/dist/main.js
# 6) payments   7) ledger   8) settlements  — all KAFKA ON
KAFKA_ENABLED=true node apps/payments/dist/main.js
KAFKA_ENABLED=true node apps/ledger/dist/main.js
KAFKA_ENABLED=true node apps/settlements/dist/main.js
# 9) notifications (optional)
KAFKA_ENABLED=true node apps/notifications/dist/main.js
```

Expected (order): `outbox relay started`, `consumer running — subscribed to topic "dispatch"`.
Expected (dispatch): `outbox relay started`, `consumer running — subscribed to topic "order"`,
`dispatch service listening on http://localhost:3005`.

> Tip: `pnpm --filter @chowdeck/<svc> dev` runs a service in watch mode (auto-reload + live
> logs) — nicer while developing. Prefix with `KAFKA_ENABLED=true` for order/dispatch.

---

## 3. Test the REST flows (everything through :3000)

```bash
G=http://localhost:3000

# --- auth ---
curl -s -X POST $G/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"supersecret1"}'

TOKEN=$(curl -s -X POST $G/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"supersecret1"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')

# protected route needs the token; without it → 401
curl -s -o /dev/null -w "%{http_code}\n" $G/users/me                       # 401
curl -s $G/users/me -H "Authorization: Bearer $TOKEN"                       # your profile

# --- catalog (browse is public; writes need the token) ---
VID=$(curl -s -X POST $G/catalog/vendors -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"Mama Put '"$RANDOM"'"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["vendor"]["id"])')

IID=$(curl -s -X POST $G/catalog/vendors/$VID/items -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"Jollof","priceKobo":250000}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["item"]["id"])')

# --- checkout (order fetches the price from catalog over gRPC — you send ids only) ---
OID=$(curl -s -X POST $G/orders -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"vendorId":"'"$VID"'","items":[{"itemId":"'"$IID"'","quantity":2}]}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["order"]["id"])')

curl -s $G/orders/$OID -H "Authorization: Bearer $TOKEN"     # totalKobo = 500000 (2×250000)
```

**Payment is automatic** (event-driven): a moment after checkout, `payments` charges the
order and the order advances **itself** to `PAID` — no manual step.

```bash
sleep 3
curl -s $G/orders/$OID -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json;print("order:",json.load(sys.stdin)["order"]["status"])'
#   → order: PAID

curl -s $G/payments/order/$OID -H "Authorization: Bearer $TOKEN"   # SUCCEEDED, amountKobo, providerRef
```

And the **ledger** books that payment as a balanced journal, split by the platform
**commission** (default 20%, `COMMISSION_BPS`):

```bash
curl -s "$G/ledger/journals?limit=50" -H "Authorization: Bearer $TOKEN"
#   → DEBIT cash <amount> / CREDIT vendor_payable:<id> <net> / CREDIT platform_revenue <commission>
curl -s $G/ledger/accounts -H "Authorization: Bearer $TOKEN"
#   → cash = total taken; vendor_payable:<id> = owed to vendor (net); platform_revenue = commission earned
```

**Settlements** accrue what we owe each vendor and pay them out — closing the money loop:

```bash
curl -s $G/settlements/balances -H "Authorization: Bearer $TOKEN"    # owed per vendor (unsettled)
curl -s -X POST $G/settlements/run -H "Authorization: Bearer $TOKEN" # pay out all vendors
# a moment later, the ledger books DEBIT vendor_payable / CREDIT cash → that vendor's
# vendor_payable balance nets back to 0 (payment credit − settlement debit).
```

Prefer a GUI? Import [`insomnia/chowdeck.insomnia.json`](insomnia/chowdeck.insomnia.json) —
folders for gateway, catalog, orders, dispatch, payments, ledger, settlements.

---

## 4. Test the event-driven dispatch loop (Kafka)

> **Nearest-rider matching:** give the vendor a pickup `lat/lng` (on `POST /catalog/vendors`)
> and give riders a location — dispatch assigns the **closest** online rider (haversine, via a
> gRPC `GetVendor` lookup), falling back to least-recently-used when coords are missing.

```bash
# a rider must be ONLINE for assignment to succeed (with a location for geo matching)
curl -s -X POST $G/dispatch/riders -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"Emeka","lat":6.5244,"lng":3.3792}'

# the order is already PAID (payments did it). Walk it the rest of the way to READY,
# which emits order.ready:
for S in VENDOR_ACCEPTED PREPARING READY; do
  curl -s -X POST $G/orders/$OID/transition -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -d "{\"status\":\"$S\"}" >/dev/null
done

sleep 3   # let the async loop run

# the order advanced ITSELF via the Kafka round-trip:
curl -s $G/orders/$OID -H "Authorization: Bearer $TOKEN" \
  | python3 -c 'import sys,json;print("order:",json.load(sys.stdin)["order"]["status"])'
#   → order: RIDER_ASSIGNED

curl -s $G/dispatch/assignments -H "Authorization: Bearer $TOKEN"   # ASSIGNED, with a riderId
```

Flow: `order.ready → dispatch assigns a rider → dispatch.rider_assigned → order → RIDER_ASSIGNED`.
If it stays `READY`, `KAFKA_ENABLED=true` isn't set on both order and dispatch.

---

## 5. Test realtime tracking (WebSockets)

`curl` can't speak WebSockets — use the committed smoke test. With the full stack running
(Kafka on):

```bash
pnpm --filter @chowdeck/dispatch smoke:track
```

It registers a user, seeds a rider, checks out, walks the order to READY, waits for the
assignment, then opens **two Socket.IO clients through the gateway** (a customer + a rider),
streams a rider location, and asserts the customer receives it. Expected tail:

```text
✓ dispatch assigned a rider (async loop closed)
✓ customer subscribed to order room; assigned rider: <id>
✓ customer received live location: { orderId: ..., lat: 6.6, lng: 3.35 }
✅ PASS — realtime tracking works end-to-end through the gateway
```

Under the hood it exercises: gateway WS-upgrade proxying, JWT auth on the handshake,
ownership-checked room subscribe, and rider→customer location fan-out.

---

## 6. See it in the dashboards

- **Kafka** → <http://localhost:8080> — topics `order`, `dispatch`, `identity`; open a topic
  to read the event envelopes (`order.ready`, `dispatch.rider_assigned`, ...).
- **MySQL** → <http://localhost:8081> (server `mysql`, user `root`, pass `root`) — inspect
  `chowdeck_order.orders`, `chowdeck_dispatch.assignments` / `riders`, and each service's
  `outbox_events` (`sent_at` stamped once the relay publishes).
- **Redis** → <http://localhost:8082> (RedisInsight) — click **Add Redis database**, host
  `redis`, port `6379` (RedisInsight reaches the container over the docker network). Browse the
  consumer dedupe keys (`processed:*`, each with a ~7-day TTL).

> **Port note:** the Redis container is published on host **6380** (not 6379) so it won't clash
> with a local/Homebrew Redis you may already run on 6379 — hence `REDIS_URL=redis://localhost:6380`.
> Inside docker the container is still `redis:6379`, which is why RedisInsight uses port 6379.

---

## 7. Automated tests

```bash
pnpm test                                       # all unit tests (no infra needed)
pnpm --filter @chowdeck/dispatch test:integration   # Kafka loop vs real Redpanda+MySQL
pnpm typecheck
```

The integration test is skipped by the normal `pnpm test` (it needs infra); the
`test:integration` script flips `RUN_INTEGRATION=1`.

---

## 8. Gotchas (things that will trip you up)

- **Consumers idle?** `KAFKA_ENABLED=true` must be set on **order** and **dispatch**. Without
  it, orders never leave `READY` and no rider is assigned.
- **Vendor create → 409?** Vendor `slug` is unique. Reusing a name collides — use a fresh
  name (the curls above append `$RANDOM`).
- **A different rider got assigned?** Dispatch picks the **least-recently-updated ONLINE**
  rider — an older test rider may win over one you just made. Read the assigned `riderId`
  from the order/assignment (the smoke test does this).
- **429 Too Many Requests?** The gateway rate-limits **120 req/min per IP**. Heavy scripted
  testing can trip it; wait a minute.
- **gRPC:** catalog must be up on **:50051** for checkout to price an order; `order` dials
  `CATALOG_GRPC_URL` (default `localhost:50051`).

---

## 9. Stop everything

```bash
# Ctrl+C each service terminal, then:
pnpm infra:down          # stop infra (keeps data)
pnpm infra:down -- -v    # stop AND wipe all data (fresh start)
```
