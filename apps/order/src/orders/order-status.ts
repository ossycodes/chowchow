import { OrderStatus } from "@chowdeck/contracts";

/**
 * The order lifecycle as an explicit state machine. Each status maps to the set of statuses
 * it may legally move to next. Terminal states (Delivered, Cancelled, Rejected, Refunded,
 * NoRiderFound) have no outgoing transitions. Any move not listed here is rejected — this is
 * what stops illegal jumps like CREATED → DELIVERED.
 *
 * In production these transitions are driven by events from other services (payments →
 * PAID, vendor app → VENDOR_ACCEPTED, dispatch → RIDER_ASSIGNED, ...). For now the order
 * service exposes a guarded transition endpoint so the machine can be exercised directly.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.Created]: [OrderStatus.Paid, OrderStatus.Cancelled],
  [OrderStatus.Paid]: [
    OrderStatus.VendorAccepted,
    OrderStatus.Rejected,
    OrderStatus.Cancelled,
  ],
  [OrderStatus.VendorAccepted]: [OrderStatus.Preparing, OrderStatus.Cancelled],
  [OrderStatus.Preparing]: [OrderStatus.Ready],
  [OrderStatus.Ready]: [OrderStatus.RiderAssigned, OrderStatus.NoRiderFound],
  [OrderStatus.RiderAssigned]: [OrderStatus.PickedUp],
  [OrderStatus.PickedUp]: [OrderStatus.Delivered],
  [OrderStatus.Delivered]: [],
  [OrderStatus.Cancelled]: [],
  [OrderStatus.Rejected]: [],
  [OrderStatus.NoRiderFound]: [OrderStatus.Cancelled, OrderStatus.Refunded],
  [OrderStatus.Refunded]: [],
};

/** Whether `from → to` is a legal move in the order state machine. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
