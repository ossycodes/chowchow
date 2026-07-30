import { z } from "zod";

/**
 * Events published by the settlements service on the "settlement" topic. A settlement pays a
 * vendor the sum of their unsettled earnings; the ledger consumes this to book the payout
 * (DEBIT vendor_payable / CREDIT cash). Amounts are always kobo.
 */
export const SettlementEventType = {
  /** A vendor was paid out for their food earnings. */
  Completed: "settlement.completed",
  /** A rider was paid out for their delivery earnings. */
  RiderCompleted: "settlement.rider_completed",
} as const;

export const settlementCompletedSchema = z.object({
  settlementId: z.string().uuid(),
  vendorId: z.string().uuid(),
  amountKobo: z.number().int().positive(),
  /** How many earnings (payments) this settlement covers. */
  earningsCount: z.number().int().positive(),
});
export type SettlementCompleted = z.infer<typeof settlementCompletedSchema>;

export const riderSettlementCompletedSchema = z.object({
  settlementId: z.string().uuid(),
  riderId: z.string().uuid(),
  amountKobo: z.number().int().positive(),
  /** How many earnings (deliveries) this settlement covers. */
  earningsCount: z.number().int().positive(),
});
export type RiderSettlementCompleted = z.infer<
  typeof riderSettlementCompletedSchema
>;
