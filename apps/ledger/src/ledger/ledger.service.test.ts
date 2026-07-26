import { describe, expect, it } from "vitest";
import type { PaymentSucceeded } from "@chowdeck/contracts";
import {
  assertBalanced,
  CASH,
  Direction,
  LedgerService,
  vendorPayable,
} from "./ledger.service";

const PAYMENT: PaymentSucceeded = {
  paymentId: "pppppppp-pppp-pppp-pppp-pppppppppppp",
  orderId: "oooooooo-oooo-oooo-oooo-oooooooooooo",
  customerId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  vendorId: "vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv",
  amountKobo: 500000,
  providerRef: "fake_ref",
};

describe("assertBalanced", () => {
  it("passes when debits equal credits", () => {
    expect(() =>
      assertBalanced([
        { accountCode: "a", direction: Direction.Debit, amountKobo: 500000 },
        { accountCode: "b", direction: Direction.Credit, amountKobo: 500000 },
      ]),
    ).not.toThrow();
  });

  it("throws when the journal doesn't balance", () => {
    expect(() =>
      assertBalanced([
        { accountCode: "a", direction: Direction.Debit, amountKobo: 500000 },
        { accountCode: "b", direction: Direction.Credit, amountKobo: 400000 },
      ]),
    ).toThrow(/unbalanced/);
  });
});

/**
 * Captures inserts by table so we can assert the journal + balanced lines without a DB.
 * Accounts already exist (ensureAccount's insert throws ER_DUP_ENTRY → treated as present).
 */
function captureDb(opts: { journalExists?: boolean } = {}) {
  const inserted: Record<string, unknown> = {};
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve(opts.journalExists ? [{ id: "existing" }] : []),
        }),
      }),
    }),
    insert: () => ({
      values: () => Promise.reject({ code: "ER_DUP_ENTRY" }), // ensureAccount: account exists
    }),
    transaction: async (cb: (tx: unknown) => Promise<void>) => {
      const tx = {
        insert: () => ({
          values: (v: unknown) => {
            // journals row is an object with `reference`; lines are an array
            if (Array.isArray(v)) inserted.lines = v;
            else inserted.journal = v;
            return Promise.resolve();
          },
        }),
      };
      return cb(tx);
    },
  };
  return { db, inserted };
}

describe("LedgerService.recordPayment", () => {
  it("books a balanced DEBIT cash / CREDIT vendor_payable journal", async () => {
    const { db, inserted } = captureDb();
    const svc = new LedgerService({ db } as never);

    await svc.recordPayment(PAYMENT);

    const journal = inserted.journal as { reference: string };
    expect(journal.reference).toBe(PAYMENT.paymentId);

    const lines = inserted.lines as Array<{
      accountCode: string;
      direction: string;
      amountKobo: number;
    }>;
    expect(lines).toHaveLength(2);
    const debit = lines.find((l) => l.direction === Direction.Debit)!;
    const credit = lines.find((l) => l.direction === Direction.Credit)!;
    expect(debit.accountCode).toBe(CASH);
    expect(credit.accountCode).toBe(vendorPayable(PAYMENT.vendorId));
    expect(debit.amountKobo).toBe(500000);
    expect(credit.amountKobo).toBe(500000);
    // the defining invariant
    expect(debit.amountKobo).toBe(credit.amountKobo);
  });

  it("is idempotent: skips a payment already booked (unique reference)", async () => {
    const { db, inserted } = captureDb({ journalExists: true });
    const svc = new LedgerService({ db } as never);

    await svc.recordPayment(PAYMENT);

    expect(inserted.journal).toBeUndefined();
    expect(inserted.lines).toBeUndefined();
  });
});
