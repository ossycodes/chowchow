import { z } from "zod";

/**
 * Request body for POST /catalog/vendors. Lengths mirror the DB columns so bad input is a
 * clean 400, not a database error. `slug` is a URL-safe handle; if omitted the service
 * derives one from the name.
 */
export const createVendorRequestSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case")
    .max(140)
    .optional(),
  description: z.string().max(500).optional(),
});

export type CreateVendorRequest = z.infer<typeof createVendorRequestSchema>;
