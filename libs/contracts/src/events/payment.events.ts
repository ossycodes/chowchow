import { z } from "zod";

/**
 * Events published by the payments service on the "payment" topic. Payments charges on
 * `order.created`; the order service consumes `payment.succeeded` to advance CREATED → PAID,
 * and the ledger records the money movement. Amounts are always kobo (integer minor units).
 */
export const PaymentEventType = {
  Succeeded: "payment.succeeded",
  Failed: "payment.failed",
} as const;

export const PaymentStatus = {
  Pending: "PENDING",
  Succeeded: "SUCCEEDED",
  Failed: "FAILED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const paymentSucceededSchema = z.object({
  paymentId: z.string().uuid(),
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  vendorId: z.string().uuid(),
  amountKobo: z.number().int().positive(),
  /** Reference returned by the payment provider (idempotency / reconciliation). */
  providerRef: z.string().min(1),
});
export type PaymentSucceeded = z.infer<typeof paymentSucceededSchema>;

export const paymentFailedSchema = z.object({
  paymentId: z.string().uuid(),
  orderId: z.string().uuid(),
  amountKobo: z.number().int().positive(),
  reason: z.string().min(1),
});
export type PaymentFailed = z.infer<typeof paymentFailedSchema>;
