import { z } from "zod";

/** Validated environment for the payments service. Unknown env keys are ignored. */
export const envSchema = z.object({
  PAYMENTS_DATABASE_URL: z
    .string({ required_error: "PAYMENTS_DATABASE_URL is required" })
    .url("PAYMENTS_DATABASE_URL must be a valid mysql:// connection string"),
  PAYMENTS_HTTP_PORT: z.coerce.number().int().positive().default(3006),
  // Which payment adapter to use. "fake" auto-approves (local dev). Real providers later.
  PAYMENT_PROVIDER: z.enum(["fake"]).default("fake"),
  // Platform commission in basis points (2000 = 20%). Applied to the order amount.
  COMMISSION_BPS: z.coerce.number().int().min(0).max(10000).default(2000),
  KAFKA_ENABLED: z.enum(["true", "false"]).default("false"),
  KAFKA_BROKERS: z.string().min(1).default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().min(1).default("chowdeck"),
});

export type Env = z.infer<typeof envSchema>;
