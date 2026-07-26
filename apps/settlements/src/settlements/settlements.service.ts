import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  SettlementEventType,
  Topics,
  type PaymentSucceeded,
  type SettlementCompleted,
} from "@chowdeck/contracts";
import { wrapEvent } from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import { earnings, outboxEvents, settlements } from "../db/schema";

export const SettlementStatus = { Paid: "PAID" } as const;

export type SettlementRow = typeof settlements.$inferSelect;

interface MysqlError {
  code?: string;
}

export interface VendorBalance {
  vendorId: string;
  owedKobo: number;
  earningsCount: number;
}

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(private readonly dbService: DbService) {}

  /**
   * Record what we owe a vendor for one payment. Called from the `payment.succeeded`
   * consumer. Idempotent: `earnings.paymentId` is unique, so a replayed event is skipped and
   * can never be paid out twice.
   */
  async recordEarning(payment: PaymentSucceeded): Promise<void> {
    try {
      await this.dbService.db.insert(earnings).values({
        id: randomUUID(),
        paymentId: payment.paymentId,
        vendorId: payment.vendorId,
        amountKobo: payment.amountKobo,
      });
    } catch (err) {
      if ((err as MysqlError).code === "ER_DUP_ENTRY") {
        this.logger.log(`payment ${payment.paymentId} already recorded — skipping`);
        return;
      }
      throw err;
    }
  }

  /** Unsettled amount owed per vendor. */
  async getBalances(): Promise<VendorBalance[]> {
    const rows = await this.dbService.db
      .select()
      .from(earnings)
      .where(isNull(earnings.settlementId));
    const byVendor = new Map<string, VendorBalance>();
    for (const r of rows) {
      const b = byVendor.get(r.vendorId) ?? {
        vendorId: r.vendorId,
        owedKobo: 0,
        earningsCount: 0,
      };
      b.owedKobo += r.amountKobo;
      b.earningsCount += 1;
      byVendor.set(r.vendorId, b);
    }
    return [...byVendor.values()];
  }

  async listSettlements(): Promise<SettlementRow[]> {
    return this.dbService.db.select().from(settlements);
  }

  /**
   * Pay out every vendor with unsettled earnings. For each vendor we snapshot the current
   * unsettled earning rows, then in ONE transaction: create the settlement, stamp those exact
   * rows with its id, and write a `settlement.completed` outbox event. Earnings that arrive
   * mid-run are left for the next run (we only touch the snapshotted ids).
   */
  async runAll(): Promise<SettlementRow[]> {
    const balances = await this.getBalances();
    const created: SettlementRow[] = [];

    for (const balance of balances) {
      const unsettled = await this.dbService.db
        .select({ id: earnings.id, amountKobo: earnings.amountKobo })
        .from(earnings)
        .where(
          and(
            eq(earnings.vendorId, balance.vendorId),
            isNull(earnings.settlementId),
          ),
        );
      if (unsettled.length === 0) continue;

      const ids = unsettled.map((e) => e.id);
      const amountKobo = unsettled.reduce((s, e) => s + e.amountKobo, 0);
      const settlementId = randomUUID();

      const payload: SettlementCompleted = {
        settlementId,
        vendorId: balance.vendorId,
        amountKobo,
        earningsCount: ids.length,
      };
      const event = wrapEvent<SettlementCompleted>(
        SettlementEventType.Completed,
        payload,
        { producer: "settlements", correlationId: settlementId },
      );

      await this.dbService.db.transaction(async (tx) => {
        await tx.insert(settlements).values({
          id: settlementId,
          vendorId: balance.vendorId,
          amountKobo,
          earningsCount: ids.length,
          status: SettlementStatus.Paid,
        });
        await tx
          .update(earnings)
          .set({ settlementId })
          .where(inArray(earnings.id, ids));
        await tx.insert(outboxEvents).values({
          id: event.id,
          topic: Topics.Settlement,
          envelope: event,
          key: balance.vendorId,
        });
      });

      this.logger.log(
        `settled vendor ${balance.vendorId}: ${amountKobo} kobo over ${ids.length} earning(s)`,
      );
      created.push({
        id: settlementId,
        vendorId: balance.vendorId,
        amountKobo,
        earningsCount: ids.length,
        status: SettlementStatus.Paid,
        createdAt: new Date(),
      });
    }

    return created;
  }
}
