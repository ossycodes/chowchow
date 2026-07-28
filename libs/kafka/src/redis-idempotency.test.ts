import { describe, expect, it, vi } from "vitest";
import { RedisProcessedEventStore } from "./redis-idempotency";
import { idempotent } from "./idempotency";

/** A tiny in-memory stand-in for Redis SET NX / DEL, shared by multiple stores. */
function fakeRedis() {
  const seen = new Set<string>();
  return {
    set: vi.fn(async (key: string) =>
      seen.has(key) ? null : (seen.add(key), "OK"),
    ),
    del: vi.fn(async (key: string) => (seen.delete(key), 1)),
  };
}

describe("RedisProcessedEventStore", () => {
  it("markIfNew is true only when the key was newly set (atomic SET NX EX)", async () => {
    const set = vi
      .fn()
      .mockResolvedValueOnce("OK") // first time → new
      .mockResolvedValueOnce(null); // second time → already present
    const store = new RedisProcessedEventStore({ set, del: vi.fn() } as never, {
      ttlSeconds: 10,
    });

    expect(await store.markIfNew("e1")).toBe(true);
    expect(await store.markIfNew("e1")).toBe(false);
    expect(set).toHaveBeenCalledWith("processed:e1", "1", "EX", 10, "NX");
  });

  it("unmark deletes the key (so a failed handler can retry)", async () => {
    const del = vi.fn().mockResolvedValue(1);
    const store = new RedisProcessedEventStore(
      { set: vi.fn(), del } as never,
    );
    await store.unmark("e1");
    expect(del).toHaveBeenCalledWith("processed:e1");
  });

  it("dedupes a redelivered event when wrapped with idempotent()", async () => {
    const store = new RedisProcessedEventStore(fakeRedis() as never);
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapped = idempotent(store, handler);

    const event = { id: "evt-1" } as never;
    await wrapped(event);
    await wrapped(event); // duplicate delivery
    expect(handler).toHaveBeenCalledOnce();
  });

  it("different namespaces DON'T collide on the same event id (per-consumer dedupe)", async () => {
    // One shared Redis, two consumers (e.g. order + ledger) with distinct key prefixes.
    const redis = fakeRedis();
    const orderStore = new RedisProcessedEventStore(redis as never, {
      keyPrefix: "processed:order:",
    });
    const ledgerStore = new RedisProcessedEventStore(redis as never, {
      keyPrefix: "processed:ledger:",
    });

    // The SAME payment.succeeded id — both consumers must see it as new.
    expect(await orderStore.markIfNew("pay-1")).toBe(true);
    expect(await ledgerStore.markIfNew("pay-1")).toBe(true);
    // ...and each still dedupes its own redelivery.
    expect(await orderStore.markIfNew("pay-1")).toBe(false);
    expect(await ledgerStore.markIfNew("pay-1")).toBe(false);
  });
});
