# ELI5 #11 — The Checkout & an Order's Journey

## What this service does

The **order** service is the **checkout counter**. A customer says "I want 2 of these and 1
of that from Mama Put," and this service turns that wish into a real, priced, tracked
**order**. It has its own database (`chowdeck_order`), separate from catalog and identity.

## The golden rule: the customer never sets the price 💰

Here's the trap a naïve checkout falls into: the phone app sends the items **and their
prices**, and the server trusts them. Now anyone can edit the request and buy a ₦5,000 meal
for ₦1.

We don't do that. The client only sends **what** they want — item ids and quantities. The
order service then **phones the catalog directly (over gRPC)** and asks, "what do these items
*actually* cost right now?" It uses *those* prices. The customer's device never gets a vote
on price.

```text
  phone ──"2× item A, 1× item B"──►  ORDER
                                       │  "what do A and B cost?"  (gRPC, doc #10)
                                       ▼
                                     CATALOG  ──►  A = ₦4,500, B = ₦1,500
                                       │
                                       ▼
                        total = 2×4500 + 1×1500 = ₦10,500  (in kobo: 1_050_000)
```

## Freezing the price (a snapshot 📸)

Once the order is placed, we **copy** each item's name and price onto the order itself. If
the vendor changes the price tomorrow, *this* order doesn't change — you're charged what you
saw. That's why each order line stores its own `unitPriceKobo`, not a link to the live
catalog price.

## All-or-nothing (one transaction)

Placing an order writes three things: the **order**, its **line items**, and an **outbox
event** (`order.created`, so other services can react later — see doc #3). These all happen
in **one database transaction** — either everything is saved, or nothing is. You can never
end up with an order that has no items, or an event with no order.

## An order's journey (the state machine 🚦)

An order isn't just "done" — it moves through a **lifecycle**, and only certain moves are
legal:

```text
CREATED → PAID → VENDOR_ACCEPTED → PREPARING → READY → RIDER_ASSIGNED → PICKED_UP → DELIVERED
   │        │           │                        │
   └─CANCELLED          └─REJECTED               └─NO_RIDER_FOUND
```

The service **enforces** this. Ask to jump straight from `PAID` to `DELIVERED` and it says
**409 Conflict — illegal transition**. Like a board game: you can only move your piece to
squares the rules allow. (Later, these moves will be driven automatically by other services —
payments flips it to `PAID`, dispatch to `RIDER_ASSIGNED` — but the *rules* live here.)

## Your orders are yours 🔒

Every order belongs to the customer who placed it (we read *who you are* from the gateway's
verified token, never from the request body). Ask for someone else's order id and you get a
**404** — as if it doesn't exist. No peeking at other people's orders.

## See it yourself (through the gateway on :3000)

```bash
# 1) log in to get a token (doc #7). Then create a vendor + item (doc #9) and note their ids.

# 2) checkout — notice we send NO prices, only ids + quantities
curl -X POST http://localhost:3000/orders \
  -H "Authorization: Bearer <accessToken>" \
  -H 'Content-Type: application/json' \
  -d '{"vendorId":"<vendorId>","items":[{"itemId":"<itemId>","quantity":2}]}'
# → the order comes back with totalKobo computed from catalog's real price

# 3) see your orders
curl http://localhost:3000/orders -H "Authorization: Bearer <accessToken>"

# 4) advance the order (legal move)
curl -X POST http://localhost:3000/orders/<orderId>/transition \
  -H "Authorization: Bearer <accessToken>" \
  -H 'Content-Type: application/json' -d '{"status":"PAID"}'

# 5) try an illegal jump → 409
curl -X POST http://localhost:3000/orders/<orderId>/transition \
  -H "Authorization: Bearer <accessToken>" \
  -H 'Content-Type: application/json' -d '{"status":"DELIVERED"}'
```

We verified all of this: the price came from catalog over gRPC (the client couldn't fake
it), the total was computed server-side, the legal move succeeded, the illegal jump was
rejected with 409, another customer got a 404 for the order, and an `order.created` event was
published through the outbox. 🧾
