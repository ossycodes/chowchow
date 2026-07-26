import { z } from "zod";
import { RiderStatus } from "../dispatch.service";

/**
 * Request body for PATCH /dispatch/riders/:id. Partial: a rider going online/offline, or
 * pinging a new location. At least one field must be present.
 */
export const updateRiderRequestSchema = z
  .object({
    status: z.enum([
      RiderStatus.Online,
      RiderStatus.Offline,
      RiderStatus.Busy,
    ]),
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "provide at least one field to update",
  });

export type UpdateRiderRequest = z.infer<typeof updateRiderRequestSchema>;
