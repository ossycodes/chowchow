import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type {
  PaymentSucceeded,
  RiderSettlementCompleted,
  SettlementCompleted,
} from "@chowdeck/contracts";
import { DbService } from "../db/db.service";
import { accounts, entryLines, journals } from "../db/schema";

export const AccountType = {
  Asset: "asset",
  Liability: "liability",
  Revenue: "revenue",
  Expense: "expense",
} as const;

export const Direction = { Debit: "DEBIT", Credit: "CREDIT" } as const;

/** Platform's cash bucket (asset). Money received from customers lands here. */
export const CASH = "cash";
/** Platform's earnings from commission (revenue). */
export const PLATFORM_REVENUE = "platform_revenue";
/** Delivery fees held for riders, collectively (liability). */
export const RIDER_PAYABLE = "rider_payable";
/** What we owe a specific vendor (liability). */
export const vendorPayable = (vendorId: string) => `vendor_payable:${vendorId}`;

interface MysqlError {
  code?: string;
}

interface DraftLine {
  accountCode: string;
  direction: (typeof Direction)[keyof typeof Direction];
  amountKobo: number;
}

export interface AccountBalance {
  code: string;
  type: string;
  debitKobo: number;
  creditKobo: number;
  /** debit − credit (naturally positive for assets, negative for liabilities). */
  balanceKobo: number;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly dbService: DbService) {}

  /**
   * Record a successful payment as a balanced double-entry journal:
   *   DEBIT  cash                     (asset ↑ — platform received money)
   *   CREDIT vendor_payable:<vendor>  (liability ↑ — platform owes the vendor)
   *   CREDIT platform_revenue          (revenue ↑ — the platform's commission)
   *   CREDIT rider_payable             (liability ↑ — delivery fee held for riders)
   * cash == vendor_amount + commission + delivery_fee, so the journal balances.
   *
   * Idempotent: `journals.reference` (= paymentId) is unique, so a replayed
   * `payment.succeeded` never double-books.
   */
  async recordPayment(payment: PaymentSucceeded): Promise<void> {
    const existing = await this.dbService.db
      .select({ id: journals.id })
      .from(journals)
      .where(eq(journals.reference, payment.paymentId))
      .limit(1);
    if (existing.length > 0) {
      this.logger.log(`payment ${payment.paymentId} already booked — skipping`);
      return;
    }

    await this.ensureAccount(CASH, AccountType.Asset);
    await this.ensureAccount(
      vendorPayable(payment.vendorId),
      AccountType.Liability,
    );

    const lines: DraftLine[] = [
      { accountCode: CASH, direction: Direction.Debit, amountKobo: payment.amountKobo },
      {
        accountCode: vendorPayable(payment.vendorId),
        direction: Direction.Credit,
        amountKobo: payment.vendorAmountKobo,
      },
    ];
    // Only book a commission line when there is one (keeps zero-commission clean).
    if (payment.commissionKobo > 0) {
      await this.ensureAccount(PLATFORM_REVENUE, AccountType.Revenue);
      lines.push({
        accountCode: PLATFORM_REVENUE,
        direction: Direction.Credit,
        amountKobo: payment.commissionKobo,
      });
    }
    // The delivery fee is held for riders (liability) until a rider is paid out.
    if (payment.deliveryFeeKobo > 0) {
      await this.ensureAccount(RIDER_PAYABLE, AccountType.Liability);
      lines.push({
        accountCode: RIDER_PAYABLE,
        direction: Direction.Credit,
        amountKobo: payment.deliveryFeeKobo,
      });
    }
    assertBalanced(lines);

    const journalId = randomUUID();
    try {
      await this.dbService.db.transaction(async (tx) => {
        await tx.insert(journals).values({
          id: journalId,
          reference: payment.paymentId,
          memo: `payment for order ${payment.orderId}`,
        });
        await tx.insert(entryLines).values(
          lines.map((l) => ({
            id: randomUUID(),
            journalId,
            accountCode: l.accountCode,
            direction: l.direction,
            amountKobo: l.amountKobo,
          })),
        );
      });
    } catch (err) {
      if ((err as MysqlError).code === "ER_DUP_ENTRY") {
        this.logger.log(`payment ${payment.paymentId} booked concurrently — skipping`);
        return;
      }
      throw err;
    }
    this.logger.log(
      `booked payment ${payment.paymentId}: DEBIT cash ${payment.amountKobo} / ` +
        `CREDIT ${vendorPayable(payment.vendorId)} ${payment.amountKobo}`,
    );
  }

  /**
   * Record a settlement payout — the reverse of a payment:
   *   DEBIT  vendor_payable:<vendor>  (liability ↓ — we owe the vendor less)
   *   CREDIT cash                     (asset ↓ — money left the platform)
   * After a vendor's earnings are settled, their vendor_payable nets back toward zero.
   * Idempotent by `reference` (= settlementId).
   */
  async recordSettlement(settlement: SettlementCompleted): Promise<void> {
    const existing = await this.dbService.db
      .select({ id: journals.id })
      .from(journals)
      .where(eq(journals.reference, settlement.settlementId))
      .limit(1);
    if (existing.length > 0) {
      this.logger.log(
        `settlement ${settlement.settlementId} already booked — skipping`,
      );
      return;
    }

    await this.ensureAccount(CASH, AccountType.Asset);
    await this.ensureAccount(
      vendorPayable(settlement.vendorId),
      AccountType.Liability,
    );

    const lines: DraftLine[] = [
      {
        accountCode: vendorPayable(settlement.vendorId),
        direction: Direction.Debit,
        amountKobo: settlement.amountKobo,
      },
      { accountCode: CASH, direction: Direction.Credit, amountKobo: settlement.amountKobo },
    ];
    assertBalanced(lines);

    const journalId = randomUUID();
    try {
      await this.dbService.db.transaction(async (tx) => {
        await tx.insert(journals).values({
          id: journalId,
          reference: settlement.settlementId,
          memo: `settlement payout to vendor ${settlement.vendorId}`,
        });
        await tx.insert(entryLines).values(
          lines.map((l) => ({
            id: randomUUID(),
            journalId,
            accountCode: l.accountCode,
            direction: l.direction,
            amountKobo: l.amountKobo,
          })),
        );
      });
    } catch (err) {
      if ((err as MysqlError).code === "ER_DUP_ENTRY") return;
      throw err;
    }
    this.logger.log(
      `booked settlement ${settlement.settlementId}: DEBIT ${vendorPayable(settlement.vendorId)} ` +
        `${settlement.amountKobo} / CREDIT cash ${settlement.amountKobo}`,
    );
  }

  /**
   * Record a rider payout — DEBIT rider_payable / CREDIT cash. Drains the collective
   * rider_payable liability as riders are paid. Idempotent by `reference` (= settlementId).
   */
  async recordRiderSettlement(
    settlement: RiderSettlementCompleted,
  ): Promise<void> {
    const existing = await this.dbService.db
      .select({ id: journals.id })
      .from(journals)
      .where(eq(journals.reference, settlement.settlementId))
      .limit(1);
    if (existing.length > 0) {
      this.logger.log(
        `rider settlement ${settlement.settlementId} already booked — skipping`,
      );
      return;
    }

    await this.ensureAccount(CASH, AccountType.Asset);
    await this.ensureAccount(RIDER_PAYABLE, AccountType.Liability);

    const lines: DraftLine[] = [
      {
        accountCode: RIDER_PAYABLE,
        direction: Direction.Debit,
        amountKobo: settlement.amountKobo,
      },
      { accountCode: CASH, direction: Direction.Credit, amountKobo: settlement.amountKobo },
    ];
    assertBalanced(lines);

    const journalId = randomUUID();
    try {
      await this.dbService.db.transaction(async (tx) => {
        await tx.insert(journals).values({
          id: journalId,
          reference: settlement.settlementId,
          memo: `settlement payout to rider ${settlement.riderId}`,
        });
        await tx.insert(entryLines).values(
          lines.map((l) => ({
            id: randomUUID(),
            journalId,
            accountCode: l.accountCode,
            direction: l.direction,
            amountKobo: l.amountKobo,
          })),
        );
      });
    } catch (err) {
      if ((err as MysqlError).code === "ER_DUP_ENTRY") return;
      throw err;
    }
    this.logger.log(
      `booked rider settlement ${settlement.settlementId}: DEBIT ${RIDER_PAYABLE} ` +
        `${settlement.amountKobo} / CREDIT cash ${settlement.amountKobo}`,
    );
  }

  /** All accounts with their debit/credit totals and net balance. */
  async getBalances(): Promise<AccountBalance[]> {
    const accs = await this.dbService.db.select().from(accounts);
    const lines = await this.dbService.db.select().from(entryLines);
    return accs.map((a) => {
      const mine = lines.filter((l) => l.accountCode === a.code);
      const debitKobo = sum(mine, Direction.Debit);
      const creditKobo = sum(mine, Direction.Credit);
      return {
        code: a.code,
        type: a.type,
        debitKobo,
        creditKobo,
        balanceKobo: debitKobo - creditKobo,
      };
    });
  }

  /** Recent journals, each with its lines. */
  async getJournals(limit = 50) {
    const js = await this.dbService.db.select().from(journals).limit(limit);
    const lines = await this.dbService.db.select().from(entryLines);
    return js.map((jrn) => ({
      ...jrn,
      lines: lines.filter((l) => l.journalId === jrn.id),
    }));
  }

  private async ensureAccount(code: string, type: string): Promise<void> {
    try {
      await this.dbService.db
        .insert(accounts)
        .values({ id: randomUUID(), code, type });
    } catch (err) {
      if ((err as MysqlError).code === "ER_DUP_ENTRY") return; // already exists
      throw err;
    }
  }
}

function sum(
  lines: { direction: string; amountKobo: number }[],
  direction: string,
): number {
  return lines
    .filter((l) => l.direction === direction)
    .reduce((acc, l) => acc + l.amountKobo, 0);
}

/** Guard the core invariant: a journal's debits must equal its credits. */
export function assertBalanced(lines: DraftLine[]): void {
  const debit = sum(lines, Direction.Debit);
  const credit = sum(lines, Direction.Credit);
  if (debit !== credit) {
    throw new Error(
      `unbalanced journal: debits ${debit} !== credits ${credit} (kobo)`,
    );
  }
}
