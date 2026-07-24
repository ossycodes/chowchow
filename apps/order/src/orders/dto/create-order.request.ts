import { z } from "zod";

/**
 * Request body for POST /orders (checkout). The client sends WHAT they want (vendor + item
 * ids + quantities) but NOT prices — the order service looks up real prices from catalog
 * over gRPC, so a customer can never dictate what they pay.
 */
export const createOrderRequestSchema = z.object({
  vendorId: z.string().uuid(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.number().int().positive().max(50),
      }),
    )
    .min(1, "an order needs at least one item")
    .max(50),
});

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
