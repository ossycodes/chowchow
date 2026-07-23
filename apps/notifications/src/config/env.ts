import { z } from "zod";

/** Validated environment for the notifications service. */
export const envSchema = z.object({
  NOTIFICATIONS_HTTP_PORT: z.coerce.number().int().positive().default(3002),
  KAFKA_ENABLED: z.enum(["true", "false"]).default("false"),
  KAFKA_BROKERS: z.string().min(1).default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().min(1).default("chowdeck"),
});

export type Env = z.infer<typeof envSchema>;
