# ELI5 #21 — The Rider's Cut (Delivery Fee)

## Completing the money split

Doc #18 split each payment two ways: the platform's **commission** and the **vendor's**
share. But someone's been missing from the payout — the **rider** who actually carries the
food! This adds the **delivery fee** so the money now splits **three** ways: vendor, platform,
and rider. 🛵💸

## Where the fee comes in

When you check out, the order now has two parts:

```text
  food subtotal   (what the items cost — from catalog)
+ delivery fee    (a flat fee, default ₦500, set by DELIVERY_FEE_KOBO)
─────────────────
= total you pay
```

So a ₦10,000 food order becomes **₦10,500** to pay, with ₦500 earmarked for the rider. The
order carries this breakdown (`subtotalKobo`, `deliveryFeeKobo`, `totalKobo`) so everyone
downstream agrees.

## Who gets what 🍰

Payments works out the split from the breakdown — and importantly, **commission is taken from
the food, not the delivery fee** (the platform doesn't skim the rider's pay):

```text
  commission  = 20% × food subtotal        (platform)
  vendor gets = food subtotal − commission  (vendor)
  rider gets  = delivery fee                (rider)
  ───────────────────────────────────────
  vendor + commission + rider = the exact total charged   ✅ (whole kobo, no leak)
```

For a ₦10,000 food order + ₦500 delivery: **vendor ₦8,000 · platform ₦2,000 · rider ₦500**.

## The books, now four lines (still balanced) ⚖️

The ledger (doc #16) books each payment across **four** accounts — and it *still* balances:

```text
  DEBIT  cash              ₦10,500   ← money in
  CREDIT vendor_payable    ₦8,000    ← we owe the vendor
  CREDIT platform_revenue  ₦2,000    ← the platform earned
  CREDIT rider_payable     ₦500      ← we owe riders (collectively)
  ─────────────────────────────────
  debit ₦10,500 == credit ₦8,000 + ₦2,000 + ₦500   ✅
```

A new **`rider_payable`** account holds delivery fees until riders are paid out. (Which
*specific* rider gets it is decided later — the rider is assigned after payment — so for now
we hold it in one pot. Per-rider payout is a future step, just like vendor settlements.)

## See it yourself

```bash
# checkout a ₦10,000 order → you're charged ₦10,500 (₦500 delivery)
curl http://localhost:3000/orders/<orderId> -H "Authorization: Bearer <token>"
#   → totalKobo 1050000, deliveryFeeKobo 50000

curl http://localhost:3000/payments/order/<orderId> -H "Authorization: Bearer <token>"
#   → amount 1050000, commission 200000, vendor 800000, delivery 50000

curl http://localhost:3000/ledger/accounts -H "Authorization: Bearer <token>"
#   → rider_payable balance grows by the delivery fee of every order
```

We verified it end to end: a ₦10,000 food order charged ₦10,500 and booked a balanced 4-way
journal — vendor ₦8,000, platform ₦2,000, rider ₦500. 🎯

## What's next

- Riders don't get **paid out** yet — `rider_payable` just accumulates. A rider-settlement
  flow (like vendor settlements, doc #17) would pay each rider for their completed deliveries.
- The fee is **flat** today; a real app varies it by **distance** (vendor→customer) — which we
  can now compute, since we already have both locations for nearest-rider matching (doc #20).
