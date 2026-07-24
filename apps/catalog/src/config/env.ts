import { z } from "zod";

/** Validated environment for the catalog service. Unknown env keys are ignored. */
export const envSchema = z.object({
  CATALOG_DATABASE_URL: z
    .string({ required_error: "CATALOG_DATABASE_URL is required" })
    .url("CATALOG_DATABASE_URL must be a valid mysql:// connection string"),
  CATALOG_HTTP_PORT: z.coerce.number().int().positive().default(3003),
});

export type Env = z.infer<typeof envSchema>;
