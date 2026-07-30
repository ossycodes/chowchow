import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  SettlementEventType,
  Topics,
  type OrderDelivered,
  type PaymentSucceeded,
  type RiderSettlementCompleted,
  type SettlementCompleted,
} from "@chowdeck/contracts";
import { wrapEvent } from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import {
  earnings,
  outboxEvents,
  riderEarnings,
  riderSettlements,
  settlements,
} from "../db/schema";

export const SettlementStatus = { Paid: "PAID" } as const;

export type SettlementRow = typeof settlements.$inferSelect;
export type RiderSettlementRow = typeof riderSettlements.$inferSelect;

interface MysqlError {
  code?: string;
}

export interface VendorBalance {
  vendorId: string;
  owedKobo: number;
  earningsCount: number;
}

export interface RiderBalance {
  riderId: string;
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
        // The vendor is owed their share (net of platform commission), not the gross charge.
        amountKobo: payment.vendorAmountKobo,
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

  // --- riders (delivery-fee earnings, accrued on order.delivered) ---

  /**
   * Record what we owe a rider for one delivered order. Idempotent: `riderEarnings.orderId`
   * is unique, so a replayed `order.delivered` can't be paid out twice.
   */
  async recordRiderEarning(delivered: OrderDelivered): Promise<void> {
    if (delivered.deliveryFeeKobo <= 0) return; // nothing owed
    try {
      await this.dbService.db.insert(riderEarnings).values({
        id: randomUUID(),
        orderId: delivered.orderId,
        riderId: delivered.riderId,
        amountKobo: delivered.deliveryFeeKobo,
      });
    } catch (err) {
      if ((err as MysqlError).code === "ER_DUP_ENTRY") {
        this.logger.log(
          `delivery for order ${delivered.orderId} already recorded — skipping`,
        );
        return;
      }
      throw err;
    }
  }

  /** Unsettled amount owed per rider. */
  async getRiderBalances(): Promise<RiderBalance[]> {
    const rows = await this.dbService.db
      .select()
      .from(riderEarnings)
      .where(isNull(riderEarnings.settlementId));
    const byRider = new Map<string, RiderBalance>();
    for (const r of rows) {
      const b = byRider.get(r.riderId) ?? {
        riderId: r.riderId,
        owedKobo: 0,
        earningsCount: 0,
      };
      b.owedKobo += r.amountKobo;
      b.earningsCount += 1;
      byRider.set(r.riderId, b);
    }
    return [...byRider.values()];
  }

  async listRiderSettlements(): Promise<RiderSettlementRow[]> {
    return this.dbService.db.select().from(riderSettlements);
  }

  /**
   * Pay out every rider with unsettled earnings — same snapshot-then-stamp pattern as vendor
   * settlements, emitting `settlement.rider_completed` (→ ledger books DEBIT rider_payable /
   * CREDIT cash).
   */
  async runRiderSettlements(): Promise<RiderSettlementRow[]> {
    const balances = await this.getRiderBalances();
    const created: RiderSettlementRow[] = [];

    for (const balance of balances) {
      const unsettled = await this.dbService.db
        .select({ id: riderEarnings.id, amountKobo: riderEarnings.amountKobo })
        .from(riderEarnings)
        .where(
          and(
            eq(riderEarnings.riderId, balance.riderId),
            isNull(riderEarnings.settlementId),
          ),
        );
      if (unsettled.length === 0) continue;

      const ids = unsettled.map((e) => e.id);
      const amountKobo = unsettled.reduce((s, e) => s + e.amountKobo, 0);
      const settlementId = randomUUID();

      const payload: RiderSettlementCompleted = {
        settlementId,
        riderId: balance.riderId,
        amountKobo,
        earningsCount: ids.length,
      };
      const event = wrapEvent<RiderSettlementCompleted>(
        SettlementEventType.RiderCompleted,
        payload,
        { producer: "settlements", correlationId: settlementId },
      );

      await this.dbService.db.transaction(async (tx) => {
        await tx.insert(riderSettlements).values({
          id: settlementId,
          riderId: balance.riderId,
          amountKobo,
          earningsCount: ids.length,
          status: SettlementStatus.Paid,
        });
        await tx
          .update(riderEarnings)
          .set({ settlementId })
          .where(inArray(riderEarnings.id, ids));
        await tx.insert(outboxEvents).values({
          id: event.id,
          topic: Topics.Settlement,
          envelope: event,
          key: balance.riderId,
        });
      });

      this.logger.log(
        `settled rider ${balance.riderId}: ${amountKobo} kobo over ${ids.length} delivery(ies)`,
      );
      created.push({
        id: settlementId,
        riderId: balance.riderId,
        amountKobo,
        earningsCount: ids.length,
        status: SettlementStatus.Paid,
        createdAt: new Date(),
      });
    }

    return created;
  }
}
