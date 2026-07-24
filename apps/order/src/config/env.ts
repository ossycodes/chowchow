import { z } from "zod";

/** Validated environment for the order service. Unknown env keys are ignored. */
export const envSchema = z.object({
  ORDER_DATABASE_URL: z
    .string({ required_error: "ORDER_DATABASE_URL is required" })
    .url("ORDER_DATABASE_URL must be a valid mysql:// connection string"),
  ORDER_HTTP_PORT: z.coerce.number().int().positive().default(3004),
  // Where the catalog gRPC server lives (host:port). Used to fetch prices at checkout.
  CATALOG_GRPC_URL: z.string().min(1).default("localhost:50051"),
  KAFKA_ENABLED: z.enum(["true", "false"]).default("false"),
  KAFKA_BROKERS: z.string().min(1).default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().min(1).default("chowdeck"),
});

export type Env = z.infer<typeof envSchema>;
