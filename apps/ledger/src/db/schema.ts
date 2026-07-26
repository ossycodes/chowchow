import {
  index,
  int,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// Ledger service tables (database chowdeck_ledger). One database per service.
// Double-entry bookkeeping: every journal has ≥2 lines whose debits == credits.

/**
 * An account is a bucket of money, identified by a stable `code` (e.g. "cash",
 * "vendor_payable:<vendorId>"). `type` follows accounting convention (asset/liability/…),
 * which decides whether a debit or credit *increases* the balance.
 */
export const accounts = mysqlTable("accounts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  code: varchar("code", { length: 128 }).notNull().unique(),
  type: varchar("type", { length: 16 }).notNull(), // asset | liability | revenue | expense
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * A journal is one balanced transaction (the "header"). `reference` is the external id it
 * records (the paymentId) and is **unique** — the source of idempotency, so replaying a
 * payment event never double-books.
 */
export const journals = mysqlTable("journals", {
  id: varchar("id", { length: 36 }).primaryKey(),
  reference: varchar("reference", { length: 128 }).notNull().unique(),
  memo: varchar("memo", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * One leg of a journal. `direction` is DEBIT or CREDIT; `amountKobo` is always positive.
 * The invariant (enforced in code): within a journal, Σ debits == Σ credits.
 */
export const entryLines = mysqlTable(
  "entry_lines",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    journalId: varchar("journal_id", { length: 36 }).notNull(),
    accountCode: varchar("account_code", { length: 128 }).notNull(),
    direction: varchar("direction", { length: 6 }).notNull(), // DEBIT | CREDIT
    amountKobo: int("amount_kobo").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("journal_id_idx").on(t.journalId),
    index("account_code_idx").on(t.accountCode),
  ],
);
