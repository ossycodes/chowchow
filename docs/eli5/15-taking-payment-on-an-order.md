# ELI5 #15 — Taking the Money (Payments)

## The moment this handles

A customer places an order. Before the kitchen starts cooking, we need to **take payment**.
The **payments** service does exactly that: it watches for new orders, charges the customer,
and — when the charge succeeds — the order moves itself from `CREATED` to `PAID`. It has its
own database (`chowdeck_payments`).

## Nobody asks; the order just announces 📣

We kept the **announcement** style (events, doc #13). The order service doesn't call
payments and wait. It simply shouts **"order 42 was created (₦5,000)"** and moves on.
Payments hears it, charges the card, and shouts back **"order 42 is paid."** The order hears
*that* and flips itself to `PAID`.

```text
  order ──"order.created {₦5,000}"──► payments
                                        │  charge the customer
                                        ▼
                          ──"payment.succeeded"──► order  → status PAID
```

Two services, zero direct calls — just events on Kafka.

## The one rule that matters most: never charge twice 🔒🔒

Double-charging a customer is the worst bug a payments system can have. We stop it **two
ways** (belt and braces):

1. **A unique lock per order.** The `payments` table allows **one row per `orderId`**. If the
   same "order.created" arrives twice (Kafka guarantees *at-least*-once, so duplicates
   happen), the second insert **fails** and we simply stop — no second charge.
2. **Idempotent consumer.** On top of that, we remember which event ids we've already handled
   and skip repeats (doc #4).

We tested it: a duplicate order never reaches the "charge" step.

## Money is counted in kobo (still) 🪙

The amount to charge comes straight from the order's `totalKobo` — the exact integer we
computed at checkout from catalog's real prices (doc #11). No floats, ever. The customer is
charged precisely what they saw.

## Pretend money for now (a swappable provider) 🎭

Real card-charging talks to a provider like **Paystack**. We didn't wire a real one yet — 
instead there's a **`PaymentProvider` port** with a **fake adapter** that auto-approves every
charge and hands back a pretend reference (`fake_<orderId>_…`). Because the payments code only
knows the *port*, dropping in a real Paystack adapter later changes **one line** and touches
no payment logic — the same ports-and-adapters trick we used for the catalog gRPC client
(doc #12).

## All-or-nothing, again

When a charge succeeds, we do two things in **one database transaction**: mark the payment
`SUCCEEDED` **and** write the `payment.succeeded` event to the outbox. So we can never end up
having taken the money without telling anyone, or announcing a payment that didn't stick.

## What you can see

- The order now reaches **`PAID` on its own** shortly after checkout — no manual step.
- `GET /payments/order/<orderId>` shows the payment: `SUCCEEDED`, the amount in kobo, and the
  provider reference.

```bash
# after checkout (docs #11), wait a moment, then:
curl http://localhost:3000/orders/<orderId> -H "Authorization: Bearer <token>"
#   → status: PAID   (payments did this via events)

curl http://localhost:3000/payments/order/<orderId> -H "Authorization: Bearer <token>"
#   → { payment: { status: "SUCCEEDED", amountKobo: 500000, providerRef: "fake_..." } }
```

We ran exactly this: checkout → `order.created` → payments charged ₦5,000 →
`payment.succeeded` → the order flipped to `PAID`, all hands-free.

## What's next

Taking the money is half the story — the books must also **record** it. The **ledger**
(next) will listen for `payment.succeeded` and write proper **double-entry** bookkeeping
(every naira debited from somewhere is credited somewhere else), so the platform's money is
always accounted for. 📒
