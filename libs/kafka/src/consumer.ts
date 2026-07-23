import type { EventEnvelope } from "@chowdeck/contracts";

/** A function that reacts to a single event. */
export type EventHandler = (event: EventEnvelope) => Promise<void>;

/**
 * Port for consuming events. Business code registers handlers per topic and never
 * touches the broker directly — so the same handler runs against Kafka in production
 * or an in-process bus in tests.
 */
export interface MessageConsumer {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Register a handler for a topic. Call before {@link run}. */
  subscribe(topic: string, handler: EventHandler): Promise<void>;
  /** Start delivering messages to the registered handlers. */
  run(): Promise<void>;
}
