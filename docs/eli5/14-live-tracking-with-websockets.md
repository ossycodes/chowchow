# ELI5 #14 — Watching the Bike Move (Live Tracking with WebSockets)

## The moment this handles

A rider is on the way with your food. You open the app and watch a little bike icon **glide
across the map in real time**. That live, moving dot is what this slice adds.

## Why normal requests can't do this

Everything so far worked like **letters**: you (the app) send a request, the server sends one
reply, conversation over. To watch a moving bike that way, the app would have to mail "where's
my rider now?" every second — wasteful, laggy, and rude to the server. 📮

Live tracking needs an **open phone line** instead of letters: a connection that **stays open**
so either side can speak the moment something happens. That's a **WebSocket**. We use
**Socket.IO** (a friendly library on top of WebSockets).

```text
  letters (REST):     app ──"where now?"──► server ──"here"──► app   (repeat every second 😴)
  phone line (WS):    app ◄════ open connection ════► server        (server just says "moved!" instantly)
```

## Who's on the call

Two kinds of people share the same live system:

- 🛵 **The rider's app** — *speaks*: streams its GPS position ("I'm at 6.60, 3.35") several
  times a second.
- 📱 **The customer's app** — *listens*: for their order, receives each new rider position and
  moves the dot.

We connect them with **rooms**. Every active order gets a room named `order:<id>`. The
customer for that order joins its room; when their rider sends a location, we deliver it to
**just that room** — so you only ever see *your* rider, never anyone else's.

## Everyone still comes through the one front door 🚪

Remember the gateway rule: the outside world only ever talks to `:3000`. WebSockets keep that
rule — the gateway now also **forwards the live connection** to the dispatch service (where
the tracking logic lives). Dispatch is never exposed to the internet directly; the "phone
line" is patched through the same receptionist as everything else.

## Proving who you are on a phone line 🪪

A letter carries its ID card each time (the `Authorization` header). A phone line is opened
**once**, so we check the ID **at the moment of connecting**: the app hands over the same JWT
token on the WebSocket handshake, and dispatch verifies it. No valid token → the line is hung
up immediately.

And there's an ownership check: when a customer says "subscribe me to order 42," dispatch
confirms **order 42 actually belongs to them** before letting them into that room. Try to peek
at a stranger's order and you get *"not your order."* We tested both: a bad token was hung up,
and one customer could **not** watch another's delivery.

## How a location update travels

```text
  rider app ──"rider:location {lat,lng}"──► dispatch
                                              │  save rider's new position
                                              │  which orders is this rider carrying?
                                              ▼
                        emit "tracking:location" to room order:42
                                              │
                                              ▼
                          customer(s) in room 42 ──► move the dot 🛵
```

There's also a **`tracking:assigned`** nudge: the instant dispatch matches a rider (the
event-driven step from doc #13), it pings the order's room so the customer's screen flips from
"finding a rider…" to "Chidi is on the way."

## See it yourself

WebSockets aren't a thing you `curl` — you need a small client. With the stack running
(`KAFKA_ENABLED=true` on order + dispatch), a tiny Node script using `socket.io-client`
connecting to `http://localhost:3000` can:

1. connect with `{ auth: { token } }`,
2. as the customer: `emit("order:subscribe", { orderId })` → receive `tracking:subscribed`,
3. as the rider: `emit("rider:location", { riderId, lat, lng })`,
4. watch the customer socket receive `tracking:location` with the new coordinates.

We ran exactly this end-to-end **through the gateway**: the rider's position arrived on the
customer's socket, scoped to the right order — the bike moved on the map. 🗺️

## What's still simple (and what's next)

Rider→customer identity binding and the map UI itself are left for the client apps; here we
built the **realtime backbone**. The other upgrade this unlocks: now that riders report live
positions, dispatch can graduate from "any available rider" to **nearest rider** using those
coordinates. That's the natural follow-on.
