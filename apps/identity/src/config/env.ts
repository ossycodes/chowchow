import { z } from "zod";

/** Validated environment for the identity service. Unknown env keys are ignored. */
export const envSchema = z.object({
  IDENTITY_DATABASE_URL: z
    .string({ required_error: "IDENTITY_DATABASE_URL is required" })
    .url("IDENTITY_DATABASE_URL must be a valid mysql:// connection string"),
  IDENTITY_HTTP_PORT: z.coerce.number().int().positive().default(3001),
  KAFKA_ENABLED: z.enum(["true", "false"]).default("false"),
  KAFKA_BROKERS: z.string().min(1).default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().min(1).default("chowdeck"),
});

export type Env = z.infer<typeof envSchema>;
