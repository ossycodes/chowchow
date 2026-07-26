# ELI5 #16 — Keeping the Books (Double-Entry Ledger)

## Why a ledger at all?

Payments (doc #15) *moved* the money. But a serious platform also has to **account** for it —
keep books that always add up, so at any moment you can answer "how much cash came in?" and
"how much do we owe each vendor?" without guessing. That's the **ledger** service. It has its
own database (`chowdeck_ledger`) and it only ever **listens** — it never changes money, it
records it.

## The 500-year-old trick: every entry has two sides ⚖️

Real accounting uses **double-entry bookkeeping**. The rule: **money never just appears or
vanishes — it always moves *from* one account *to* another.** So every transaction is written
as (at least) two lines that must **balance**: the total **debits** equal the total
**credits**.

When a customer pays ₦5,000 for an order, we write one **journal** with two lines:

```text
  DEBIT   cash                      ₦5,000     ← the platform now holds ₦5,000 more
  CREDIT  vendor_payable:<vendor>   ₦5,000     ← the platform now OWES the vendor ₦5,000 more
  ─────────────────────────────────────────
  debits ₦5,000  ==  credits ₦5,000   ✅ balanced
```

The money didn't vanish — it moved from "we owe nobody" into "cash we hold" **and** "money we
owe the vendor." Two sides, always equal. If a journal ever *didn't* balance, that's a bug,
so the code **refuses to write it** (`assertBalanced`).

## Accounts are labelled buckets 🪣

- **cash** — an *asset*: money the platform is holding. Debits increase it.
- **vendor_payable:&lt;vendorId&gt;** — a *liability*: money we owe that specific vendor.
  Credits increase it.

Accounts are created the first time they're needed. Later, the sum tells the story: total
`cash` = all money taken; each `vendor_payable:X` = what we still owe vendor X (until
settlement pays them out).

## It listens, it never double-books 🔁

The ledger subscribes to **`payment.succeeded`** (the same event that flips the order to
`PAID`). Because Kafka can deliver a message more than once, we guard against booking the same
payment twice: each **journal's `reference` is the `paymentId` and is unique** — a replay just
gets skipped. (Plus the idempotent-consumer check from doc #4.) We tested it: booking the same
payment again is a no-op.

## What you can see

```bash
# every account with its debit/credit totals and net balance
curl http://localhost:3000/ledger/accounts -H "Authorization: Bearer <token>"
#   → cash: debit=..., credit=0, balance=...   (all money taken in)
#   → vendor_payable:<id>: credit=..., balance=-...   (what we owe that vendor)

# recent journals, each with its balanced lines
curl "http://localhost:3000/ledger/journals?limit=50" -H "Authorization: Bearer <token>"
```

We ran a real order for ₦7,500: payments charged it, and the ledger booked
`DEBIT cash 750000 / CREDIT vendor_payable:<vendor> 750000` — debits equal credits, and the
`cash` account grew by exactly ₦7,500. 📒✅

## What's still simple (and what's next)

Right now every naira a customer pays is credited to the **vendor**. In reality the platform
keeps a **commission**, riders earn a **delivery fee**, and taxes apply — so a fuller journal
would split the credit across several accounts (still balanced!). And **settlements** would
later pay each `vendor_payable` out to the vendor's bank and zero it. Those build directly on
this double-entry foundation.
