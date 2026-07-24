import { z } from "zod";

/** Validated environment for the API gateway. */
export const envSchema = z.object({
  GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  JWT_ACCESS_SECRET: z.string().min(16),
  IDENTITY_URL: z.string().url().default("http://localhost:3001"),
  NOTIFICATIONS_URL: z.string().url().default("http://localhost:3002"),
  // Comma-separated list of allowed origins, or "*" for any.
  CORS_ORIGIN: z.string().default("*"),
});

export type Env = z.infer<typeof envSchema>;
