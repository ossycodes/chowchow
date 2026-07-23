import { z } from "zod";

/** Request body for the dev-only POST /notifications/_simulate endpoint. */
export const simulateRequestSchema = z.object({
  email: z.string().email().max(255).optional(),
  userId: z.string().uuid().optional(),
  eventId: z.string().min(1).max(128).optional(),
});

export type SimulateRequest = z.infer<typeof simulateRequestSchema>;
