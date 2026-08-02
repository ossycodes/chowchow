# ELI5 #26 — Consumers That Recover Quickly (Kafka Resilience)

## The problem we kept hitting

While building and testing, we restarted services a *lot*. Every so often the event consumers
would go haywire — logging `Request Fetch timed out` crashes over and over, and only calming
down after a while (or a Kafka restart). This is a small **hardening** pass to fix that.

## Why it happened: the "dead seat" problem 🪑

Consumers of the same topic form a **group**, and Kafka splits the work between the members
(doc #4). When a member joins or leaves, the group does a **rebalance** — it pauses and
re-divides the work.

Here's the catch: when you **kill** a consumer, Kafka doesn't know instantly. It keeps that
member's "seat" reserved until it misses enough heartbeats — by default a full **30 seconds**.
For those 30s the group thinks a member is still there but silent, so it keeps trying to
rebalance and the others' reads (fetches) **stall** — and eventually time out and crash. In
fast dev restarts, this happened over and over.

## The fix: give up the seat faster ⏱️

Two small tuning changes to the shared Kafka consumer:

- **Shorter session timeout (30s → 10s):** a crashed/killed member is declared gone in ~10s
  instead of 30, so the group settles quickly instead of stalling.
- **Always self-heal:** if a consumer's loop ever does crash (a transient blip), it now
  **restarts itself** instead of leaving the process wedged.

We also told the client to **keep retrying** transient connection errors rather than giving up.

## Did it help?

We tested the exact scenario that used to break: with the whole fleet running, we **killed and
restarted one consumer**. Result:

- it **rejoined its group in ~4 seconds** (was tens of seconds of thrashing),
- **zero crashes** on the restarted service, and
- **zero crashes** across the rest of the fleet during the rebalance,
- and a checkout still flowed to `PAID` right after.

## The takeaway

None of the *logic* changed — the outbox, idempotency, and exactly-once-effects guarantees are
the same. This is purely **operational** hardening: the system now recovers from a restart
gracefully instead of thrashing, which matters a lot once real deploys roll pods in and out. 🛠️
