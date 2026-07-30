import { z } from "zod";

/** Validated environment for the settlements service. Unknown env keys are ignored. */
export const envSchema = z.object({
  SETTLEMENT_DATABASE_URL: z
    .string({ required_error: "SETTLEMENT_DATABASE_URL is required" })
    .url("SETTLEMENT_DATABASE_URL must be a valid mysql:// connection string"),
  SETTLEMENT_HTTP_PORT: z.coerce.number().int().positive().default(3008),
  // Automatic payouts: when enabled, run vendor + rider payouts on a timer (in production
  // this would be nightly). The manual /run endpoints stay available as an ops override.
  SETTLEMENT_SCHEDULE_ENABLED: z.enum(["true", "false"]).default("false"),
  SETTLEMENT_INTERVAL_MS: z.coerce.number().int().positive().default(300000),
  KAFKA_ENABLED: z.enum(["true", "false"]).default("false"),
  KAFKA_BROKERS: z.string().min(1).default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().min(1).default("chowdeck"),
});

export type Env = z.infer<typeof envSchema>;
