import { describe, expect, it } from "vitest";
import { Topics } from "@chowdeck/contracts";
import { wrapEvent } from "./envelope";
import { InMemoryBus } from "./in-memory-bus";
import { InMemoryProcessedEventStore, idempotent } from "./idempotency";
import type { EventHandler } from "./consumer";

const userRegistered = () =>
  wrapEvent(
    "user.registered",
    { userId: "u1", email: "ada@example.com" },
    { producer: "identity" },
  );

describe("publish → subscribe loop (InMemoryBus)", () => {
  it("delivers a published event to a subscribed handler", async () => {
    const bus = new InMemoryBus();
    const received: string[] = [];
    await bus.subscribe(Topics.Identity, async (e) => {
      received.push(e.type);
    });

    await bus.publish(Topics.Identity, userRegistered());

    expect(received).toEqual(["user.registered"]);
  });
});

describe("idempotent handler", () => {
  it("processes a duplicate event only once", async () => {
    const store = new InMemoryProcessedEventStore();
    let calls = 0;
    const handler = idempotent(store, async () => {
      calls += 1;
    });

    const event = userRegistered();
    await handler(event);
    await handler(event); // same id → skipped
    await handler(event);

    expect(calls).toBe(1);
  });

  it("allows retry after a failure (reservation released)", async () => {
    const store = new InMemoryProcessedEventStore();
    let attempts = 0;
    const flaky: EventHandler = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("db down");
    };
    const handler = idempotent(store, flaky);

    const event = userRegistered();
    await expect(handler(event)).rejects.toThrow("db down");
    await handler(event); // retry succeeds

    expect(attempts).toBe(2);
  });
});
