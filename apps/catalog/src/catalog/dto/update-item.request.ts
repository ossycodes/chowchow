import { z } from "zod";

/**
 * Request body for PATCH /catalog/items/:id. Every field is optional (partial update), but
 * at least one must be present — an empty patch is rejected as a 400.
 */
export const updateItemRequestSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500),
    priceKobo: z.number().int().positive().max(100_000_000),
    isAvailable: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "provide at least one field to update",
  });

export type UpdateItemRequest = z.infer<typeof updateItemRequestSchema>;
