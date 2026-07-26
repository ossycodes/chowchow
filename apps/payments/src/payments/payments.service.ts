import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  PaymentEventType,
  PaymentStatus,
  Topics,
  type OrderCreated,
  type PaymentFailed,
  type PaymentSucceeded,
} from "@chowdeck/contracts";
import { wrapEvent } from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import { outboxEvents, payments } from "../db/schema";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider";

export type PaymentRow = typeof payments.$inferSelect;

interface MysqlError {
  code?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly dbService: DbService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Charge for a newly created order. Called from the `order.created` consumer.
   *
   * Idempotent: `payments.orderId` is unique, so a redelivered event can never double-charge
   * — the second insert fails and we skip. On a provider success/failure we update the
   * payment and write the matching `payment.succeeded`/`payment.failed` outbox event in ONE
   * transaction (so the event can't be lost or sent without the state change).
   */
  async handleOrderCreated(order: OrderCreated): Promise<void> {
    const paymentId = randomUUID();
    try {
      await this.dbService.db.insert(payments).values({
        id: paymentId,
        orderId: order.orderId,
        customerId: order.customerId,
        vendorId: order.vendorId,
        amountKobo: order.totalKobo,
        status: PaymentStatus.Pending,
      });
    } catch (err) {
      if ((err as MysqlError).code === "ER_DUP_ENTRY") {
        this.logger.log(`order ${order.orderId} already has a payment — skipping`);
        return;
      }
      throw err;
    }

    const result = await this.provider.charge({
      amountKobo: order.totalKobo,
      reference: order.orderId,
      customerId: order.customerId,
    });

    if (result.success) {
      const payload: PaymentSucceeded = {
        paymentId,
        orderId: order.orderId,
        customerId: order.customerId,
        vendorId: order.vendorId,
        amountKobo: order.totalKobo,
        providerRef: result.providerRef,
      };
      const event = wrapEvent<PaymentSucceeded>(
        PaymentEventType.Succeeded,
        payload,
        { producer: "payments", correlationId: order.orderId },
      );
      await this.dbService.db.transaction(async (tx) => {
        await tx
          .update(payments)
          .set({
            status: PaymentStatus.Succeeded,
            providerRef: result.providerRef,
          })
          .where(eq(payments.id, paymentId));
        await tx.insert(outboxEvents).values({
          id: event.id,
          topic: Topics.Payment,
          envelope: event,
          key: order.orderId,
        });
      });
      this.logger.log(`charged order ${order.orderId} (${order.totalKobo} kobo)`);
      return;
    }

    // failure path
    const payload: PaymentFailed = {
      paymentId,
      orderId: order.orderId,
      amountKobo: order.totalKobo,
      reason: result.reason ?? "charge declined",
    };
    const event = wrapEvent<PaymentFailed>(PaymentEventType.Failed, payload, {
      producer: "payments",
      correlationId: order.orderId,
    });
    await this.dbService.db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status: PaymentStatus.Failed })
        .where(eq(payments.id, paymentId));
      await tx.insert(outboxEvents).values({
        id: event.id,
        topic: Topics.Payment,
        envelope: event,
        key: order.orderId,
      });
    });
    this.logger.warn(
      `payment failed for order ${order.orderId}: ${payload.reason}`,
    );
  }

  async getByOrder(orderId: string): Promise<PaymentRow | null> {
    const [row] = await this.dbService.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .limit(1);
    return row ?? null;
  }

  async listForCustomer(customerId: string): Promise<PaymentRow[]> {
    return this.dbService.db
      .select()
      .from(payments)
      .where(eq(payments.customerId, customerId));
  }
}
