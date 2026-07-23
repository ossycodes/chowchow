import type { EventEnvelope } from "@chowdeck/contracts";

/**
 * Port for publishing events. Business code depends on this interface, never on a
 * concrete broker — so we can swap Kafka for an in-memory fake in tests / local dev.
 */
export interface MessageProducer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** `key` controls partitioning; default to the aggregate id for per-key ordering. */
  publish(topic: string, event: EventEnvelope, key?: string): Promise<void>;
}

/**
 * In-memory producer for local dev and unit tests. Records everything it "publishes"
 * so callers can assert on it. Never use in production.
 */
export class InMemoryProducer implements MessageProducer {
  readonly published: Array<{ topic: string; event: EventEnvelope; key?: string }> =
    [];

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async publish(topic: string, event: EventEnvelope, key?: string): Promise<void> {
    this.published.push({ topic, event, key });
  }
}
