import { z } from "zod";

/**
 * Events published by the settlements service on the "settlement" topic. A settlement pays a
 * vendor the sum of their unsettled earnings; the ledger consumes this to book the payout
 * (DEBIT vendor_payable / CREDIT cash). Amounts are always kobo.
 */
export const SettlementEventType = {
  Completed: "settlement.completed",
} as const;

export const settlementCompletedSchema = z.object({
  settlementId: z.string().uuid(),
  vendorId: z.string().uuid(),
  amountKobo: z.number().int().positive(),
  /** How many earnings (payments) this settlement covers. */
  earningsCount: z.number().int().positive(),
});
export type SettlementCompleted = z.infer<typeof settlementCompletedSchema>;
