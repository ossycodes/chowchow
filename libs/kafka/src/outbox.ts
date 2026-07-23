import type { EventEnvelope } from "@chowdeck/contracts";
import type { MessageProducer } from "./producer";

export interface OutboxRecord {
  /** Same id as the wrapped event — the dedupe key for consumers. */
  id: string;
  topic: string;
  event: EventEnvelope;
  key?: string;
  createdAt: string;
  /** Set once the relay has published it. */
  sentAt?: string;
}

/**
 * Port for the outbox table. In production the `save` runs inside the same DB
 * transaction as the business write (e.g. inserting the user), which is what makes
 * "state changed" and "event recorded" atomic — no lost or ghost events.
 */
export interface OutboxStore {
  save(record: Omit<OutboxRecord, "sentAt">): Promise<void>;
  fetchUnsent(limit: number): Promise<OutboxRecord[]>;
  markSent(ids: string[]): Promise<void>;
}

/** In-memory outbox for local dev and unit tests. */
export class InMemoryOutboxStore implements OutboxStore {
  private readonly records = new Map<string, OutboxRecord>();

  async save(record: Omit<OutboxRecord, "sentAt">): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async fetchUnsent(limit: number): Promise<OutboxRecord[]> {
    return [...this.records.values()]
      .filter((r) => !r.sentAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit);
  }

  async markSent(ids: string[]): Promise<void> {
    for (const id of ids) {
      const rec = this.records.get(id);
      if (rec) rec.sentAt = new Date().toISOString();
    }
  }
}

export interface OutboxRelayOptions {
  batchSize?: number;
}

/**
 * Polls the outbox and publishes pending events, then marks them sent.
 *
 * Ordering is deliberate: publish first, mark sent second. A crash between the two
 * re-publishes on the next run → **at-least-once** delivery. Consumers must dedupe on
 * `event.id`. (Marking sent first would risk losing an event on crash — worse.)
 */
export class OutboxRelay {
  constructor(
    private readonly store: OutboxStore,
    private readonly producer: MessageProducer,
    private readonly options: OutboxRelayOptions = {},
  ) {}

  /** Drain one batch. Returns the number of events published. Call on an interval. */
  async drain(): Promise<number> {
    const batch = await this.store.fetchUnsent(this.options.batchSize ?? 100);
    if (batch.length === 0) return 0;

    const sentIds: string[] = [];
    for (const rec of batch) {
      await this.producer.publish(rec.topic, rec.event, rec.key);
      sentIds.push(rec.id);
    }
    await this.store.markSent(sentIds);
    return sentIds.length;
  }
}
