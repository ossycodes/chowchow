import { describe, expect, it } from "vitest";
import { Topics } from "@chowdeck/contracts";
import { wrapEvent } from "./envelope";
import { InMemoryProducer, type MessageProducer } from "./producer";
import {
  InMemoryOutboxStore,
  OutboxRelay,
  type OutboxRecord,
} from "./outbox";

function makeRecord(seq: number): Omit<OutboxRecord, "sentAt"> {
  const event = wrapEvent(
    "user.registered",
    { userId: `user-${seq}` },
    { producer: "identity" },
  );
  return {
    id: event.id,
    topic: Topics.Identity,
    event,
    key: `user-${seq}`,
    createdAt: new Date(Date.now() + seq).toISOString(),
  };
}

describe("wrapEvent", () => {
  it("produces a well-formed envelope", () => {
    const env = wrapEvent("order.created", { orderId: "abc" }, { producer: "order" });
    expect(env.type).toBe("order.created");
    expect(env.version).toBe(1);
    expect(env.producer).toBe("order");
    expect(env.id).toMatch(/[0-9a-f-]{36}/);
    expect(() => new Date(env.occurredAt).toISOString()).not.toThrow();
    expect(env.payload).toEqual({ orderId: "abc" });
  });
});

describe("OutboxRelay", () => {
  it("publishes pending records then marks them sent", async () => {
    const store = new InMemoryOutboxStore();
    const producer = new InMemoryProducer();
    const relay = new OutboxRelay(store, producer);

    await store.save(makeRecord(1));
    await store.save(makeRecord(2));

    const published = await relay.drain();

    expect(published).toBe(2);
    expect(producer.published).toHaveLength(2);
    expect(producer.published[0].topic).toBe(Topics.Identity);
    // second drain finds nothing left
    expect(await relay.drain()).toBe(0);
    expect(producer.published).toHaveLength(2);
  });

  it("preserves creation order", async () => {
    const store = new InMemoryOutboxStore();
    const producer = new InMemoryProducer();
    const relay = new OutboxRelay(store, producer);

    await store.save(makeRecord(1));
    await store.save(makeRecord(2));
    await store.save(makeRecord(3));
    await relay.drain();

    const keys = producer.published.map((p) => p.key);
    expect(keys).toEqual(["user-1", "user-2", "user-3"]);
  });

  it("re-publishes on the next run if publish fails (at-least-once)", async () => {
    const store = new InMemoryOutboxStore();
    let failNext = true;
    const flaky: MessageProducer = {
      published: [] as unknown[],
      async connect() {},
      async disconnect() {},
      async publish(topic, event, key) {
        if (failNext) {
          failNext = false;
          throw new Error("broker unavailable");
        }
        (this.published as unknown[]).push({ topic, event, key });
      },
    } as MessageProducer & { published: unknown[] };

    await store.save(makeRecord(1));

    await expect(relayDrain(store, flaky)).rejects.toThrow("broker unavailable");
    // not marked sent → still pending
    expect(await store.fetchUnsent(10)).toHaveLength(1);

    // second run succeeds
    const published = await relayDrain(store, flaky);
    expect(published).toBe(1);
    expect(await store.fetchUnsent(10)).toHaveLength(0);
  });
});

function relayDrain(store: InMemoryOutboxStore, producer: MessageProducer) {
  return new OutboxRelay(store, producer).drain();
}
