import {
  index,
  int,
  json,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// Order service tables (database chowdeck_order). One database per service.

/**
 * An order placed by a customer against a single vendor. Money is in **kobo** (integer
 * minor units). `status` moves through the OrderStatus state machine (see order-status.ts);
 * illegal transitions are rejected in the service.
 */
export const orders = mysqlTable(
  "orders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    customerId: varchar("customer_id", { length: 36 }).notNull(),
    vendorId: varchar("vendor_id", { length: 36 }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    // The rider assigned to deliver this order (set on RIDER_ASSIGNED). Null until then.
    riderId: varchar("rider_id", { length: 36 }),
    // Delivery fee (rider's share) in kobo. totalKobo already includes it.
    deliveryFeeKobo: int("delivery_fee_kobo").notNull().default(0),
    totalKobo: int("total_kobo").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("customer_id_idx").on(t.customerId)],
);

/**
 * A single line of an order. Price/name are **snapshotted** at checkout — later catalog
 * price changes must never alter a placed order. `lineTotalKobo` = unitPriceKobo × quantity.
 */
export const orderItems = mysqlTable(
  "order_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    orderId: varchar("order_id", { length: 36 }).notNull(),
    itemId: varchar("item_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    unitPriceKobo: int("unit_price_kobo").notNull(),
    quantity: int("quantity").notNull(),
    lineTotalKobo: int("line_total_kobo").notNull(),
  },
  (t) => [index("order_id_idx").on(t.orderId)],
);

/**
 * Transactional outbox: written in the SAME transaction as the order, then published to
 * Kafka by the relay and stamped `sentAt`. `sentAt IS NULL` = pending.
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
