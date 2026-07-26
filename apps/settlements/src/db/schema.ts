import {
  index,
  int,
  json,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// Settlements service tables (database chowdeck_settlement). One database per service.

/**
 * One row per payment we owe a vendor (an "earning"). `paymentId` is unique — the source of
 * idempotency, so a replayed `payment.succeeded` can't be counted twice. `settlementId` is
 * NULL until the earning is paid out, then set to the settlement that covered it.
 */
export const earnings = mysqlTable(
  "earnings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    paymentId: varchar("payment_id", { length: 36 }).notNull().unique(),
    vendorId: varchar("vendor_id", { length: 36 }).notNull(),
    amountKobo: int("amount_kobo").notNull(),
    settlementId: varchar("settlement_id", { length: 36 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("vendor_unsettled_idx").on(t.vendorId, t.settlementId)],
);

/** A payout to a vendor for the sum of their unsettled earnings at the time it ran. */
export const settlements = mysqlTable(
  "settlements",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    vendorId: varchar("vendor_id", { length: 36 }).notNull(),
    amountKobo: int("amount_kobo").notNull(),
    earningsCount: int("earnings_count").notNull(),
    status: varchar("status", { length: 16 }).notNull(), // PAID
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("vendor_id_idx").on(t.vendorId)],
);

/**
 * Transactional outbox: written in the SAME transaction as the settlement, then published
 * to Kafka by the relay and stamped `sentAt`. `sentAt IS NULL` = pending.
 */
export const outboxEvents = mysqlTable(
  "outbox_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    topic: varchar("topic", { length: 64 }).notNull(),
    envelope: json("envelope").notNull(),
    key: varchar("key", { length: 128 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    sentAt: timestamp("sent_at"),
  },
  (t) => [index("sent_at_idx").on(t.sentAt)],
);
