# ELI5 #17 — Paying the Vendors (Settlements)

## The moment this handles

Customers have paid; the ledger says the platform now **owes** each vendor money (their
`vendor_payable` balance from doc #16). Eventually we have to actually **send vendors their
money** — a payout. That's the **settlements** service. It has its own database
(`chowdeck_settlement`) and it closes the money loop: *money in → owed → paid out.*

## Keeping a tab per vendor 🧾

Every time a payment succeeds, settlements writes down **one line**: "we owe vendor V ₦X for
payment P." We store it per **payment** (not as a running total) for a good reason:
**idempotency**. The `paymentId` is unique, so if the same `payment.succeeded` event is
delivered twice, the second write is refused — a vendor can never be paid twice for the same
order. (This is the same "unique key" trick the payments and ledger services use.)

A vendor's **balance owed** is simply the sum of their lines that haven't been paid out yet.

## Doing a payout run 💸

An operator (later: a scheduler, e.g. nightly) calls **`POST /settlements/run`**. For each
vendor who's owed something, we:

1. snapshot their unpaid lines,
2. add them up,
3. create one **settlement** (the payout record) for that total,
4. stamp those exact lines as "paid by settlement S,"
5. announce **`settlement.completed`**.

All of that happens in **one transaction** per vendor, so a payout and the lines it covers can
never disagree. Lines that arrive *during* the run are simply left for next time.

## The books must reflect the payout too ⚖️

Remember double-entry (doc #16): money moving must be recorded on **both** sides. So the
**ledger listens for `settlement.completed`** and books the reverse of a payment:

```text
  payment.succeeded  →  DEBIT  cash                     / CREDIT vendor_payable   (we owe more)
  settlement.completed → DEBIT vendor_payable           / CREDIT cash             (we owe less, cash out)
```

After a vendor is settled, their `vendor_payable` **nets back to zero** — the credit from the
payment and the debit from the settlement cancel out. We saw this exactly: a vendor paid
₦12,000 across two orders showed `vendor_payable` **debit 1,200,000 == credit 1,200,000,
balance 0** after settlement. The books stay perfectly balanced end to end. ✅

## The whole money loop, closed 🔁

```text
  customer pays ──► payments ──payment.succeeded──┬─► ledger:      CREDIT vendor_payable (owe)
                                                  └─► settlements: record earning
  operator runs payout ──► settlement.completed ──► ledger:        DEBIT vendor_payable (paid)
                                                                    → vendor_payable back to 0
```

## See it yourself

```bash
# what we currently owe each vendor (unsettled)
curl http://localhost:3000/settlements/balances -H "Authorization: Bearer <token>"

# pay everyone out
curl -X POST http://localhost:3000/settlements/run -H "Authorization: Bearer <token>"

# the payout records
curl http://localhost:3000/settlements -H "Authorization: Bearer <token>"

# and the vendor's ledger account nets to zero
curl http://localhost:3000/ledger/accounts -H "Authorization: Bearer <token>"
```

## What's still simple (and what's next)

- Real payouts would call a **bank/transfer provider** (behind a port, like the payment
  provider) instead of just recording "PAID."
- We pay the vendor the **full** order amount today. A real marketplace keeps a
  **commission** and pays riders a **delivery fee** — so a payment's credit would split across
  vendor + platform + rider (still balanced), and settlements would pay the net.
- A **scheduler** would run payouts automatically (e.g. nightly) instead of a manual button.

These build straight on the foundation we now have. 🏗️
