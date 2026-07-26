import { z } from "zod";
import { RiderStatus } from "../dispatch.service";

/** Request body for POST /dispatch/riders. lat/lng optional (rider may not have pinged yet). */
export const registerRiderRequestSchema = z.object({
  name: z.string().min(1).max(120),
  status: z
    .enum([RiderStatus.Online, RiderStatus.Offline, RiderStatus.Busy])
    .optional(),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
});

export type RegisterRiderRequest = z.infer<typeof registerRiderRequestSchema>;
