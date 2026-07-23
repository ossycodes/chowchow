import {
  index,
  json,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// Identity service tables (database chowdeck_identity). One database per service.

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  actorType: varchar("actor_type", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Transactional outbox: written in the SAME transaction as the business change, then
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
