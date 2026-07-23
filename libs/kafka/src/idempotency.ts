import type { EventHandler } from "./consumer";

/**
 * Remembers which event ids we've already handled, so at-least-once delivery doesn't
 * cause double-processing (e.g. sending two welcome emails).
 */
export interface ProcessedEventStore {
  /** Atomically reserve an id. Returns true if it's new (caller should process). */
  markIfNew(eventId: string): Promise<boolean>;
  /** Release a reservation so a failed handler can be retried later. */
  unmark(eventId: string): Promise<void>;
}

/** In-memory store for local dev and tests. Swap for Redis/DB in production. */
export class InMemoryProcessedEventStore implements ProcessedEventStore {
  private readonly seen = new Set<string>();

  async markIfNew(eventId: string): Promise<boolean> {
    if (this.seen.has(eventId)) return false;
    this.seen.add(eventId);
    return true;
  }

  async unmark(eventId: string): Promise<void> {
    this.seen.delete(eventId);
  }
}

/**
 * Wrap a handler so duplicates are skipped. We reserve the id first, then process; if
 * processing throws we release the reservation so the message can be retried (rather
 * than being silently swallowed).
 */
export function idempotent(
  store: ProcessedEventStore,
  handler: EventHandler,
): EventHandler {
  return async (event) => {
    const isNew = await store.markIfNew(event.id);
    if (!isNew) return; // already handled — skip
    try {
      await handler(event);
    } catch (err) {
      await store.unmark(event.id);
      throw err;
    }
  };
}
