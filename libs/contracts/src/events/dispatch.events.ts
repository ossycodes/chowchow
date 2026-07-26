import { z } from "zod";

/**
 * Events published by the dispatch service on the "dispatch" topic. Dispatch owns rider
 * assignment; the order service consumes these to advance the order's status.
 */
export const DispatchEventType = {
  RiderAssigned: "dispatch.rider_assigned",
} as const;

/** Emitted when dispatch has matched an online rider to a ready order. */
export const riderAssignedSchema = z.object({
  assignmentId: z.string().uuid(),
  orderId: z.string().uuid(),
  riderId: z.string().uuid(),
});
export type RiderAssigned = z.infer<typeof riderAssignedSchema>;
