# ELI5 #23 — Paying on a Timer (Payout Scheduler)

## The last manual step

Vendors and riders now get paid (docs #17, #22) — but only when someone **presses the button**
(`POST /settlements/run` and `/settlements/riders/run`). A real platform doesn't have a human
clicking "pay everyone" every night. So this adds a **scheduler** that runs both payouts
**automatically on a timer**. ⏰

## What it does

Inside the settlements service, a small timer wakes up every so often and runs **both** payouts —
exactly what the manual buttons do, just triggered by the clock:

```text
  every N ms ─► runAll()               (pay vendors owed)
             └► runRiderSettlements()  (pay riders owed)
```

If nothing is owed, it does nothing (quietly). If there are pending earnings, it settles them
and logs a one-line summary, e.g. `scheduled payout: 11 vendor(s), 0 rider(s)`.

## Off by default, easy to turn on

It's controlled by two settings, so it never surprises you in local dev:

- `SETTLEMENT_SCHEDULE_ENABLED` — `false` by default (the timer doesn't run at all).
- `SETTLEMENT_INTERVAL_MS` — how often it fires when enabled (default 5 minutes; production
  might set this to "once a day").

The **manual endpoints stay** — handy as an ops override ("pay everyone *now*") even when the
timer is on.

## Careful, like the outbox relay

It reuses the same safe pattern as the outbox relay (doc #3): a single **in-flight guard** so
two runs can never overlap, and it stops cleanly on shutdown. And because the payout logic
itself is idempotent (earnings are stamped as paid inside a transaction), even if a run
overlapped it couldn't pay anyone twice.

## See it yourself

```bash
# start settlements with the timer on and a short interval
SETTLEMENT_SCHEDULE_ENABLED=true SETTLEMENT_INTERVAL_MS=8000 \
  KAFKA_ENABLED=true node apps/settlements/dist/main.js

# place + deliver some orders, then watch the log — it settles them on its own:
#   [SettlementScheduler] scheduled payout: N vendor(s), M rider(s)
```

We verified it: with the timer on, pending vendor earnings were paid out automatically — no
button press — and the ledger booked each payout as usual.

## What's next

The interval is a simple "every N ms." A production setup would use a real **cron** (e.g. 2am
daily) and, once there are multiple settlement instances, a **leader lock** so only one runs
the payout — but the payout code wouldn't change, just the trigger.
