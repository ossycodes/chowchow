import { z } from "zod";

/**
 * Canonical order lifecycle. The order-orchestrator owns transitions; illegal jumps
 * are rejected. Each transition emits an event on the "order" topic.
 */
export const OrderStatus = {
  Created: "CREATED",
  Paid: "PAID",
  VendorAccepted: "VENDOR_ACCEPTED",
  Preparing: "PREPARING",
  Ready: "READY",
  RiderAssigned: "RIDER_ASSIGNED",
  PickedUp: "PICKED_UP",
  Delivered: "DELIVERED",
  Cancelled: "CANCELLED",
  Rejected: "REJECTED",
  NoRiderFound: "NO_RIDER_FOUND",
  Refunded: "REFUNDED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const OrderEventType = {
  Created: "order.created",
  Paid: "order.paid",
  Ready: "order.ready",
  RiderAssigned: "order.rider_assigned",
  Delivered: "order.delivered",
  Cancelled: "order.cancelled",
} as const;

/** Money is always integer minor units (kobo). Never floats. */
export const orderCreatedSchema = z.object({
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  vendorId: z.string().uuid(),
  /** Food subtotal (sum of line items) in kobo. */
  subtotalKobo: z.number().int().nonnegative(),
  /** Delivery fee (the rider's share) in kobo. */
  deliveryFeeKobo: z.number().int().nonnegative(),
  /** Grand total charged to the customer = subtotal + delivery fee. */
  totalKobo: z.number().int().nonnegative(),
  status: z.literal(OrderStatus.Created),
});
export type OrderCreated = z.infer<typeof orderCreatedSchema>;

/**
 * Emitted when the vendor has the food ready for pickup. This is dispatch's cue to find a
 * rider. Carries just enough for dispatch to act (which order, which vendor to pick up from).
 */
export const orderReadySchema = z.object({
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  vendorId: z.string().uuid(),
  status: z.literal(OrderStatus.Ready),
});
export type OrderReady = z.infer<typeof orderReadySchema>;

/**
 * Emitted when an order is delivered. The rider has earned their delivery fee — settlements
 * consumes this to accrue a rider earning (the rider is only paid for completed deliveries).
 */
export const orderDeliveredSchema = z.object({
  orderId: z.string().uuid(),
  customerId: z.string().uuid(),
  vendorId: z.string().uuid(),
  riderId: z.string().uuid(),
  deliveryFeeKobo: z.number().int().nonnegative(),
  status: z.literal(OrderStatus.Delivered),
});
export type OrderDelivered = z.infer<typeof orderDeliveredSchema>;
