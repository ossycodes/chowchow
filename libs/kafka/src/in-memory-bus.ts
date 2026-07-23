import type { EventEnvelope } from "@chowdeck/contracts";
import type { MessageProducer } from "./producer";
import type { EventHandler, MessageConsumer } from "./consumer";

/**
 * A single-process pub/sub bus that implements BOTH ports. Publishing invokes every
 * subscribed handler synchronously. Used to exercise the full publish→subscribe loop
 * in tests without a real broker. Not for production (no persistence, no cross-process).
 */
export class InMemoryBus implements MessageProducer, MessageConsumer {
  private readonly handlers = new Map<string, EventHandler[]>();

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async publish(topic: string, event: EventEnvelope): Promise<void> {
    for (const handler of this.handlers.get(topic) ?? []) {
      await handler(event);
    }
  }

  async subscribe(topic: string, handler: EventHandler): Promise<void> {
    const list = this.handlers.get(topic) ?? [];
    list.push(handler);
    this.handlers.set(topic, list);
  }

  async run(): Promise<void> {}
}
