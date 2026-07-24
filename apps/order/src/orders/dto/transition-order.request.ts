import { z } from "zod";
import { OrderStatus } from "@chowdeck/contracts";

/**
 * Request body for POST /orders/:id/transition. `status` must be one of the known order
 * statuses; whether the *specific* move is legal is enforced by the state machine (a valid
 * status that's an illegal jump → 409, not 400).
 */
export const transitionOrderRequestSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

export type TransitionOrderRequest = z.infer<
  typeof transitionOrderRequestSchema
>;
