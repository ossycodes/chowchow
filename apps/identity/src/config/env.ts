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
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1209600),
});

export type Env = z.infer<typeof envSchema>;
