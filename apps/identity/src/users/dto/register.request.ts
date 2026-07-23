import { z } from "zod";

/**
 * Request body for POST /auth/register. Deliberately does NOT accept `actorType` — public
 * self-registration always creates a **customer**. Vendors/riders/admins are created via
 * separate, authorized flows. Lengths mirror the DB columns so bad input is a clean 400,
 * not a database error.
 */
export const registerRequestSchema = z.object({
  email: z.string().email().max(255),
  phone: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/, "phone must be 7–15 digits, optional leading +")
    .max(32)
    .optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
