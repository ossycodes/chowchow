import {
  boolean,
  index,
  int,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// Catalog service tables (database chowdeck_catalog). One database per service.

/**
 * A vendor is a restaurant/store customers order from. `slug` is a URL-friendly unique
 * handle (e.g. "mamas-kitchen"). `isOpen` gates whether it currently accepts orders.
 */
export const vendors = mysqlTable("vendors", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  description: varchar("description", { length: 500 }),
  isOpen: boolean("is_open").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * A menu item belongs to exactly one vendor. Price is stored in **kobo** (integer minor
 * units) — never floats, so money math stays exact. `isAvailable` lets a vendor hide an
 * item (e.g. sold out) without deleting it.
 */
export const menuItems = mysqlTable(
  "menu_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    vendorId: varchar("vendor_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 500 }),
    priceKobo: int("price_kobo").notNull(),
    isAvailable: boolean("is_available").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("vendor_id_idx").on(t.vendorId)],
);
