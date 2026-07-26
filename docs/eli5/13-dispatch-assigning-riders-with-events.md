# ELI5 #13 — Finding a Rider, Without Anyone Waiting (Event-Driven Dispatch)

## The moment this handles

The food is ready. Now someone has to **carry it to the customer**. The **dispatch** service
is the matchmaker: it watches for ready orders and hands each one to an available **rider**.
It has its own database (`chowdeck_dispatch`) holding the rider fleet and the assignments.

## The big idea: nobody phones anybody 📣

We had two ways to connect order and dispatch (we discussed this earlier):

- **Phone call** (order *directly asks* dispatch for a rider) — simple, but if dispatch is
  busy or down, checkout/where-ever is stuck waiting.
- **Announcement** (order just **shouts "order 42 is ready!"** to the room; whoever cares
  reacts) — order doesn't wait, doesn't even know dispatch exists.

We chose the **announcement** style — **events over Kafka**. This is the loose-coupling
pattern from doc #3, now doing real work across *three* services.

## The relay race 🏃‍♂️🏃‍♀️

Watch one order become a delivery. Each service does its bit and passes the baton by
**publishing an event** — nobody blocks waiting for the next runner:

```text
  ORDER                         KAFKA                 DISPATCH                    ORDER
  ─────                         ─────                 ────────                    ─────
  food ready
  status → READY
  emit "order.ready"  ───────►  order topic  ───────► hears it
                                                       picks an ONLINE rider
                                                       assignment = ASSIGNED
                                                       rider → BUSY
                                                       emit "dispatch.rider_assigned"
                                              ◄─────── dispatch topic ──────────► hears it
                                                                                  order → RIDER_ASSIGNED
```

Notice: the order service **published and moved on**. Seconds later a *different* event came
back and its status advanced — no waiting, no direct call. Each service only knows the
**events**, never the others' code or address.

## Who does what

- **Order** now both **speaks and listens**: it *emits* `order.ready` when the food's ready,
  and it *listens* for `dispatch.rider_assigned` to flip itself to `RIDER_ASSIGNED`. Its
  status is now driven by the world, not just by manual pokes.
- **Dispatch** **listens** for `order.ready`, picks a rider, and **emits**
  `dispatch.rider_assigned`.

Both use the same trustworthy plumbing we built earlier: the **outbox** (so an event is saved
in the *same* database transaction as the change — never lost) and **idempotent consumers**
(so if Kafka delivers a message twice, we don't assign two riders — doc #4).

## Picking the rider (for now: simple; later: smart)

Right now dispatch picks the **least-recently-used ONLINE rider** — fair and simple. The
riders table already stores each rider's **lat/lng**, so the *next* slice (realtime) will
upgrade this to **nearest rider to the restaurant** using live locations. We built the
plumbing first; the clever geo-matching rides on top.

## What if no rider is free? 🤷

If every rider is offline or BUSY, dispatch doesn't drop the order — it records the
assignment as **PENDING** (no rider yet) and emits nothing. The order simply stays `READY`
until a rider frees up and a later sweep picks it up. We verified this: with the only rider
BUSY, a new ready order's assignment sat at `PENDING` and the order stayed `READY`.

## See it yourself (through the gateway on :3000)

> This loop needs Kafka **on**. Run `pnpm infra:up` and start the order + dispatch services
> with `KAFKA_ENABLED=true` (otherwise the consumers sit idle by design).

```bash
# 1) put a rider on the road (ONLINE by default)
curl -X POST http://localhost:3000/dispatch/riders \
  -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
  -d '{"name":"Emeka","lat":6.5244,"lng":3.3792}'

# 2) place an order (docs #9/#11), then walk it to READY:
for S in PAID VENDOR_ACCEPTED PREPARING READY; do
  curl -X POST http://localhost:3000/orders/<orderId>/transition \
    -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
    -d "{\"status\":\"$S\"}"
done

# 3) a second or two later — the order moved itself, hands-free:
curl http://localhost:3000/orders/<orderId> -H "Authorization: Bearer <token>"
#    → status: RIDER_ASSIGNED
curl http://localhost:3000/dispatch/assignments -H "Authorization: Bearer <token>"
#    → the assignment is ASSIGNED with a riderId; the rider is now BUSY
```

We ran exactly this: `order.ready` went out, dispatch assigned Emeka, `dispatch.rider_assigned`
came back, and the order advanced to `RIDER_ASSIGNED` on its own — three services cooperating
through nothing but events. 🎉

## What's next

The rider is assigned but invisible. The **realtime** slice adds **WebSockets** so the rider
app streams live location and the customer watches the bike move on a map — and dispatch
upgrades to true nearest-rider matching.
