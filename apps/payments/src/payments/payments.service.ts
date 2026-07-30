import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
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
  private readonly commissionBps = Number(process.env.COMMISSION_BPS ?? 2000);

  constructor(
    private readonly dbService: DbService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Start a charge for a newly created order (from the `order.created` consumer). We record a
   * PENDING payment with the money split precomputed, then ask the provider to initialize:
   *  - a `succeeded` result (fake provider) finalizes immediately → `payment.succeeded`;
   *  - a `pending` result (Paystack) waits for the signed webhook (see {@link handleWebhook}).
   *
   * Idempotent: `payments.orderId` is unique, so a redelivered event can never double-charge.
   */
  async handleOrderCreated(order: OrderCreated): Promise<void> {
    // Split the charge up front: platform commission from the FOOD subtotal, delivery fee for
    // the rider, the rest to the vendor. Integer kobo → parts sum back to the exact amount.
    const commissionKobo = Math.floor(
      (order.subtotalKobo * this.commissionBps) / 10000,
    );
    const vendorAmountKobo = order.subtotalKobo - commissionKobo;
    const deliveryFeeKobo = order.deliveryFeeKobo;

    const paymentId = randomUUID();
    try {
      await this.dbService.db.insert(payments).values({
        id: paymentId,
        orderId: order.orderId,
        customerId: order.customerId,
        vendorId: order.vendorId,
        amountKobo: order.totalKobo,
        commissionKobo,
        vendorAmountKobo,
        deliveryFeeKobo,
        status: PaymentStatus.Pending,
      });
    } catch (err) {
      if ((err as MysqlError).code === "ER_DUP_ENTRY") {
        this.logger.log(`order ${order.orderId} already has a payment — skipping`);
        return;
      }
      throw err;
    }

    const result = await this.provider.initialize({
      amountKobo: order.totalKobo,
      reference: order.orderId,
      customerId: order.customerId,
    });
    await this.dbService.db
      .update(payments)
      .set({
        providerRef: result.providerRef,
        authorizationUrl: result.authorizationUrl,
      })
      .where(eq(payments.id, paymentId));

    if (result.outcome === "succeeded") {
      await this.finalizeSuccess(paymentId);
    } else if (result.outcome === "failed") {
      await this.finalizeFailed(paymentId, result.reason ?? "charge declined");
    } else {
      this.logger.log(
        `order ${order.orderId} charge pending — awaiting provider webhook`,
      );
    }
  }

  /**
   * Handle a provider webhook: verify the signature, then finalize the matching payment.
   * Public and unauthenticated (providers don't carry our JWT) — trust comes from the
   * signature, checked by the adapter. Invalid signature → 400.
   */
  async handleWebhook(
    signature: string | undefined,
    rawBody: Buffer,
  ): Promise<void> {
    const result = this.provider.verifyWebhook(signature, rawBody);
    if (!result) throw new BadRequestException("invalid webhook");

    const payment = await this.getByOrder(result.reference);
    if (!payment) {
      this.logger.warn(`webhook for unknown order ${result.reference} — ignoring`);
      return;
    }
    if (result.outcome === "succeeded") {
      await this.finalizeSuccess(payment.id);
    } else {
      await this.finalizeFailed(payment.id, "charge failed at provider");
    }
  }

  /** Mark a PENDING payment SUCCEEDED and emit `payment.succeeded`. Idempotent. */
  private async finalizeSuccess(paymentId: string): Promise<void> {
    const payment = await this.getById(paymentId);
    if (!payment || payment.status !== PaymentStatus.Pending) return; // already final

    const payload: PaymentSucceeded = {
      paymentId: payment.id,
      orderId: payment.orderId,
      customerId: payment.customerId,
      vendorId: payment.vendorId,
      amountKobo: payment.amountKobo,
      commissionKobo: payment.commissionKobo,
      vendorAmountKobo: payment.vendorAmountKobo,
      deliveryFeeKobo: payment.deliveryFeeKobo,
      providerRef: payment.providerRef ?? "unknown",
    };
    const event = wrapEvent<PaymentSucceeded>(
      PaymentEventType.Succeeded,
      payload,
      { producer: "payments", correlationId: payment.orderId },
    );
    await this.dbService.db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status: PaymentStatus.Succeeded })
        .where(eq(payments.id, payment.id));
      await tx.insert(outboxEvents).values({
        id: event.id,
        topic: Topics.Payment,
        envelope: event,
        key: payment.orderId,
      });
    });
    this.logger.log(
      `charged order ${payment.orderId} (${payment.amountKobo} kobo; commission ` +
        `${payment.commissionKobo}, vendor ${payment.vendorAmountKobo}, ` +
        `delivery ${payment.deliveryFeeKobo})`,
    );
  }

  private async finalizeFailed(
    paymentId: string,
    reason: string,
  ): Promise<void> {
    const payment = await this.getById(paymentId);
    if (!payment || payment.status !== PaymentStatus.Pending) return;

    const payload: PaymentFailed = {
      paymentId: payment.id,
      orderId: payment.orderId,
      amountKobo: payment.amountKobo,
      reason,
    };
    const event = wrapEvent<PaymentFailed>(PaymentEventType.Failed, payload, {
      producer: "payments",
      correlationId: payment.orderId,
    });
    await this.dbService.db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status: PaymentStatus.Failed })
        .where(eq(payments.id, payment.id));
      await tx.insert(outboxEvents).values({
        id: event.id,
        topic: Topics.Payment,
        envelope: event,
        key: payment.orderId,
      });
    });
    this.logger.warn(`payment failed for order ${payment.orderId}: ${reason}`);
  }

  private async getById(id: string): Promise<PaymentRow | null> {
    const [row] = await this.dbService.db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);
    return row ?? null;
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
