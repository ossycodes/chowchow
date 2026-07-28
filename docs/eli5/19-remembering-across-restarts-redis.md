# ELI5 #19 — Remembering Across Restarts (Redis Idempotency)

## The problem we quietly had

Kafka promises **at-least-once** delivery — so a service can receive the *same* event more
than once. To avoid acting twice (charging twice, booking twice), each consumer keeps a list
of "event ids I've already handled" and skips repeats (doc #4).

But that list lived **in memory**. Two weaknesses:

1. **Restart = amnesia.** Redeploy a service and the list is empty again — so on the next
   boot it might re-handle old events. (You saw this: services "reprocessing history" after a
   restart.)
2. **Doesn't scale out.** Run two copies of a service for load, and each has its *own*
   memory — one copy doesn't know what the other already handled.

## The fix: write the memory down, in Redis 📝

**Redis** is a fast, shared, in-memory database (already in our stack for exactly this kind of
job). We now keep the "already handled" list **in Redis** instead of local memory. So the
memory:

- **survives restarts** — the ids are still there after a redeploy, and
- **is shared** — every copy of a service reads the same list.

## The clever one-liner ⚡

Marking an id as handled and checking if it's new is **one atomic Redis command**:

```text
  SET processed:<eventId> 1  EX <7 days>  NX
```

- `NX` = "only set it if it doesn't already exist."
- The reply tells us whether *we* were the one who set it: **"OK" → new** (go handle the
  event); **null → someone already did** (skip).

Because it's a single atomic operation, even two copies racing on the same event can't both
"win" — exactly one gets the "OK." And `EX <7 days>` means each id **auto-expires** after a
week, so Redis doesn't grow forever (a week is far longer than any redelivery window).

## Best of both worlds

It's env-driven: set **`REDIS_URL`** and consumers use Redis (durable, shared); leave it unset
(e.g. in a unit test) and they fall back to the simple in-memory list. Same behaviour, just
more or less durable.

## See it yourself

With the stack running, place an order, then peek at Redis:

```bash
# browse them in RedisInsight (http://localhost:8082), or via the CLI. The container is on
# host port 6380 (so it doesn't clash with a local Redis on 6379):
redis-cli -p 6380 --scan --pattern 'processed:*'   # the handled-event ids
redis-cli -p 6380 TTL processed:<id>               # ~604800 (7 days), counting down
```

We verified it: after a checkout, a `processed:<event-id>` key appeared with a ~7-day TTL —
the dedupe memory is now written down, so a restart no longer forgets. 🧠💾
