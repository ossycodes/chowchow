import { z } from "zod";

/**
 * Request body for POST /catalog/vendors/:id/items. Price is in **kobo** (integer minor
 * units) — the API never accepts fractional naira, so money stays exact end-to-end.
 */
export const createItemRequestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  priceKobo: z.number().int().positive().max(100_000_000), // ≤ ₦1,000,000
  isAvailable: z.boolean().optional(),
});

export type CreateItemRequest = z.infer<typeof createItemRequestSchema>;
