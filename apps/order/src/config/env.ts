import { z } from "zod";

/** Validated environment for the order service. Unknown env keys are ignored. */
export const envSchema = z.object({
  ORDER_DATABASE_URL: z
    .string({ required_error: "ORDER_DATABASE_URL is required" })
    .url("ORDER_DATABASE_URL must be a valid mysql:// connection string"),
  ORDER_HTTP_PORT: z.coerce.number().int().positive().default(3004),
  // Where the catalog gRPC server lives (host:port). Used to fetch prices at checkout.
  CATALOG_GRPC_URL: z.string().min(1).default("localhost:50051"),
  // Delivery fee (rider's share). When the vendor + customer locations are known it's
  // distance-based: BASE + PER_KM × km. Otherwise the flat DELIVERY_FEE_KOBO is used.
  DELIVERY_FEE_KOBO: z.coerce.number().int().nonnegative().default(50000),
  DELIVERY_FEE_BASE_KOBO: z.coerce.number().int().nonnegative().default(30000),
  DELIVERY_FEE_PER_KM_KOBO: z.coerce.number().int().nonnegative().default(5000),
  // Distance provider: how the vendor→customer route (km + ETA) is measured.
  //   haversine (default) = offline straight-line × ROAD_FACTOR, ETA from AVG_SPEED_KMH.
  //   osrm = real road distance from an OSRM routing server at OSRM_URL.
  DISTANCE_PROVIDER: z.enum(["haversine", "osrm"]).default("haversine"),
  ROAD_FACTOR: z.coerce.number().positive().default(1.3),
  AVG_SPEED_KMH: z.coerce.number().positive().default(25),
  OSRM_URL: z.string().url().default("https://router.project-osrm.org"),
  OSRM_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  KAFKA_ENABLED: z.enum(["true", "false"]).default("false"),
  KAFKA_BROKERS: z.string().min(1).default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().min(1).default("chowdeck"),
});

export type Env = z.infer<typeof envSchema>;
