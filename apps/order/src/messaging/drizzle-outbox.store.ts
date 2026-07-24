import { Injectable } from "@nestjs/common";
import { asc, inArray, isNull } from "drizzle-orm";
import type { EventEnvelope } from "@chowdeck/contracts";
import type { OutboxRecord, OutboxStore } from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import { outboxEvents } from "../db/schema";

/**
 * MySQL-backed {@link OutboxStore} used by the relay. The *write* side (saving an event
 * atomically with the order) happens inside OrdersService's transaction; this store serves
 * the relay's read/mark side, plus a standalone `save` for completeness.
 */
@Injectable()
export class DrizzleOutboxStore implements OutboxStore {
  constructor(private readonly dbService: DbService) {}

  async save(record: Omit<OutboxRecord, "sentAt">): Promise<void> {
    await this.dbService.db.insert(outboxEvents).values({
      id: record.id,
      topic: record.topic,
      envelope: record.event,
      key: record.key,
      createdAt: new Date(record.createdAt),
    });
  }

  async fetchUnsent(limit: number): Promise<OutboxRecord[]> {
    const rows = await this.dbService.db
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.sentAt))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      topic: r.topic,
      event: r.envelope as EventEnvelope,
      key: r.key ?? undefined,
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt?.toISOString(),
    }));
  }

  async markSent(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.dbService.db
      .update(outboxEvents)
      .set({ sentAt: new Date() })
      .where(inArray(outboxEvents.id, ids));
  }
}
