import {
  double,
  index,
  json,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// Dispatch service tables (database chowdeck_dispatch). One database per service.

/**
 * A rider in the delivery fleet. `status` gates availability (only ONLINE riders can be
 * assigned). lat/lng are the rider's last known position (nullable until first ping) — used
 * later for nearest-rider matching and live tracking.
 */
export const riders = mysqlTable("riders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  status: varchar("status", { length: 16 }).notNull(), // ONLINE | OFFLINE | BUSY
  lat: double("lat"),
  lng: double("lng"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * A delivery assignment for one order. Created when an `order.ready` event arrives. Status
 * starts PENDING (no rider yet) or ASSIGNED (matched to a rider). One assignment per order.
 */
export const assignments = mysqlTable(
  "assignments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    orderId: varchar("order_id", { length: 36 }).notNull().unique(),
    customerId: varchar("customer_id", { length: 36 }).notNull(),
    vendorId: varchar("vendor_id", { length: 36 }).notNull(),
    riderId: varchar("rider_id", { length: 36 }),
    status: varchar("status", { length: 16 }).notNull(), // PENDING | ASSIGNED | PICKED_UP | DELIVERED
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("rider_id_idx").on(t.riderId)],
);

/**
 * Transactional outbox: written in the SAME transaction as the assignment, then published
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
