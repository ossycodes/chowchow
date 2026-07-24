import { z } from "zod";

export const loginRequestSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(100),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
