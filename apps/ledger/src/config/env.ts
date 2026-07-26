import { z } from "zod";

/** Validated environment for the ledger service. Unknown env keys are ignored. */
export const envSchema = z.object({
  LEDGER_DATABASE_URL: z
    .string({ required_error: "LEDGER_DATABASE_URL is required" })
    .url("LEDGER_DATABASE_URL must be a valid mysql:// connection string"),
  LEDGER_HTTP_PORT: z.coerce.number().int().positive().default(3007),
  KAFKA_ENABLED: z.enum(["true", "false"]).default("false"),
  KAFKA_BROKERS: z.string().min(1).default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().min(1).default("chowdeck"),
});

export type Env = z.infer<typeof envSchema>;
