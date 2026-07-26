# ELI5 #18 — Taking a Cut (Commission Splits)

## The problem with what we had

Until now, when a customer paid ₦5,000 for an order, the vendor was credited the **whole**
₦5,000. But a delivery platform is a business — it keeps a **commission** for running the
marketplace. So the money from each order should really be **split**: some to the platform,
the rest to the vendor.

## Split it once, at payment time ✂️

The split is decided in **one place** — the **payments** service, when it charges the order —
and then *announced* so everyone downstream agrees. Payments computes:

```text
  commission = order amount × rate      (default 20%, set by COMMISSION_BPS)
  vendor gets = order amount − commission
```

For a ₦10,000 order at 20%: **commission ₦2,000**, **vendor ₦8,000**. These are whole **kobo**,
and vendor + commission always add back to the exact charge — no lost half-kobo. Payments puts
**all three numbers** (`amountKobo`, `commissionKobo`, `vendorAmountKobo`) into the
`payment.succeeded` event, so nobody downstream has to guess or recompute.

> Basis points? `COMMISSION_BPS=2000` means 20% (2000 / 10000). It's an integer, so the rate
> itself is exact too.

## The books split three ways (still balanced) ⚖️

The **ledger** (doc #16) now books the payment across **three** accounts instead of two — and
it *still* balances (debits == credits):

```text
  DEBIT  cash               ₦10,000    ← money came in
  CREDIT vendor_payable     ₦8,000     ← we owe the vendor their share
  CREDIT platform_revenue   ₦2,000     ← the platform earned this
  ───────────────────────────────────
  debit ₦10,000  ==  credit ₦8,000 + ₦2,000  ✅
```

A new account, **`platform_revenue`**, now collects every commission — that's the platform's
income, visible at a glance in `/ledger/accounts`.

## Vendors get paid the *net* 💸

Because the split is in the event, **settlements** (doc #17) simply records the vendor's
**net** share (₦8,000), not the gross. So when we pay the vendor out, we pay them exactly what
they're owed — and their `vendor_payable` still nets to zero, while the platform keeps its
commission in `platform_revenue`.

## See it yourself

```bash
# after a ₦10,000 checkout (default 20% commission):
curl http://localhost:3000/payments/order/<orderId> -H "Authorization: Bearer <token>"
#   → amountKobo 1000000, commissionKobo 200000, vendorAmountKobo 800000

curl http://localhost:3000/ledger/accounts -H "Authorization: Bearer <token>"
#   → platform_revenue: credit 200000   ·   vendor_payable:<id>: credit 800000

curl http://localhost:3000/settlements/balances -H "Authorization: Bearer <token>"
#   → owed to that vendor: 800000  (the net, not 1000000)
```

We ran exactly this: the ₦10,000 order split into ₦2,000 platform + ₦8,000 vendor, the ledger
booked all three lines balanced, and settlements owed the vendor the ₦8,000 net. 🎯

## What's still simple (and what's next)

- Riders don't get a **delivery fee** yet — that needs a delivery fee added to the order at
  checkout, then a fourth line crediting `rider_payable`. Same idea, one more split.
- The commission is a flat rate for everyone; real platforms vary it by vendor/category.
- Taxes (VAT) would be yet another line.

All of these are just **more lines on the same balanced journal** — the foundation already
supports them.
