import {
  index,
  int,
  json,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// Payments service tables (database chowdeck_payments). One database per service.

/**
 * One payment attempt per order. `orderId` is unique — the source of idempotency, so a
 * redelivered `order.created` can never charge twice. Amount is in kobo. `providerRef` is
 * the reference returned by the payment provider (for reconciliation).
 */
export const payments = mysqlTable(
  "payments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    orderId: varchar("order_id", { length: 36 }).notNull().unique(),
    customerId: varchar("customer_id", { length: 36 }).notNull(),
    vendorId: varchar("vendor_id", { length: 36 }).notNull(),
    amountKobo: int("amount_kobo").notNull(),
    status: varchar("status", { length: 16 }).notNull(), // PENDING | SUCCEEDED | FAILED
    providerRef: varchar("provider_ref", { length: 128 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("customer_id_idx").on(t.customerId)],
);

/**
 * Transactional outbox: written in the SAME transaction as the payment status change, then
 * published to Kafka by the relay and stamped `sentAt`. `sentAt IS NULL` = pending.
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
