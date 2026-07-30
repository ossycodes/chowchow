# ELI5 #22 — Paying the Riders (Rider Settlements)

## Closing the last money loop

Doc #21 started collecting a **delivery fee** for the rider — but it just piled up in a
`rider_payable` pot; nobody actually got paid. This pays riders out, the same way vendors are
paid (doc #17). Now **everyone** who's owed money — vendors *and* riders — gets settled. 💸

## Riders earn on **delivery**, not before 🏁

A rider is paid for *finishing the job*. So the earning is recorded only when an order reaches
**DELIVERED** — not when they're assigned, and not when the customer pays. The order service
now:

1. **remembers which rider** was assigned (stored on the order when dispatch matches them), and
2. when the order is marked **DELIVERED**, shouts **`order.delivered`** carrying the rider and
   the delivery fee.

```text
  order → DELIVERED ──"order.delivered {rider, fee}"──► settlements: record rider earning
```

Settlements writes down "we owe rider R ₦500 for order X." As with vendors, it's keyed by the
**order id** so a repeated event can't pay the same delivery twice (idempotent).

## Paying them out 💵

An operator calls **`POST /settlements/riders/run`** (later: a scheduler). For each rider with
unpaid earnings, settlements — in one transaction — creates a **payout**, stamps those
earnings as paid, and shouts **`settlement.rider_completed`**.

## The books, kept straight ⚖️

The delivery fee's journey through the ledger, start to finish:

```text
  at payment:   … CREDIT rider_payable  ₦500   (we now owe riders ₦500 — doc #21)
  at payout:    DEBIT  rider_payable    ₦500   (we owe ₦500 less)
                CREDIT cash             ₦500   (₦500 left the platform → the rider)
```

So `rider_payable` **nets back to zero** for a settled delivery — exactly like `vendor_payable`
does after a vendor payout. We verified the whole thing: a delivered order accrued a ₦500
rider earning, `POST /settlements/riders/run` paid it, and the ledger booked a balanced
`DEBIT rider_payable / CREDIT cash` — draining the pot. 🎯

## One settlements service, two kinds of payout

Rather than a whole new service, we **extended settlements**: it now tracks both vendor
earnings (from `payment.succeeded`) and rider earnings (from `order.delivered`), with parallel
run endpoints:

| | Vendors | Riders |
|---|---------|--------|
| earn on | `payment.succeeded` | `order.delivered` |
| pay out | `POST /settlements/run` | `POST /settlements/riders/run` |
| ledger books | DEBIT vendor_payable / CREDIT cash | DEBIT rider_payable / CREDIT cash |

## The complete money picture 🧾

For a ₦10,000 food order + ₦500 delivery, once everyone is settled:

- customer paid **₦10,500** → held in `cash`, then paid out
- vendor received **₦8,000** (food − commission)
- platform kept **₦2,000** (commission, in `platform_revenue`)
- rider received **₦500** (delivery fee)
- every `*_payable` account nets to **zero**; the books balance at every step.

## See it yourself

```bash
curl http://localhost:3000/settlements/riders/balances -H "Authorization: Bearer <token>"
#   → owed per rider (unsettled deliveries)
curl -X POST http://localhost:3000/settlements/riders/run -H "Authorization: Bearer <token>"
#   → pays out all riders; a moment later rider_payable in /ledger/accounts drops
```

## What's next

- Both payouts are still **manual buttons** — a **scheduler** would run them automatically
  (nightly, say). Same code, on a timer.
- Real payouts would call a **bank transfer** provider (behind a port, like the payment
  provider) instead of just recording "PAID."
