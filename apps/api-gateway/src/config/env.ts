import { z } from "zod";

/** Validated environment for the API gateway. */
export const envSchema = z.object({
  GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  JWT_ACCESS_SECRET: z.string().min(16),
  IDENTITY_URL: z.string().url().default("http://localhost:3001"),
  NOTIFICATIONS_URL: z.string().url().default("http://localhost:3002"),
  CATALOG_URL: z.string().url().default("http://localhost:3003"),
  ORDER_URL: z.string().url().default("http://localhost:3004"),
  DISPATCH_URL: z.string().url().default("http://localhost:3005"),
  PAYMENTS_URL: z.string().url().default("http://localhost:3006"),
  LEDGER_URL: z.string().url().default("http://localhost:3007"),
  // Comma-separated list of allowed origins, or "*" for any.
  CORS_ORIGIN: z.string().default("*"),
});

export type Env = z.infer<typeof envSchema>;
