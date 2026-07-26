import { describe, expect, it } from "vitest";
import { OrderStatus } from "@chowdeck/contracts";
import { ALLOWED_TRANSITIONS, canTransition } from "./order-status";

describe("order state machine", () => {
  it("allows the happy-path lifecycle end to end", () => {
    const happyPath: OrderStatus[] = [
      OrderStatus.Created,
      OrderStatus.Paid,
      OrderStatus.VendorAccepted,
      OrderStatus.Preparing,
      OrderStatus.Ready,
      OrderStatus.RiderAssigned,
      OrderStatus.PickedUp,
      OrderStatus.Delivered,
    ];
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(canTransition(happyPath[i], happyPath[i + 1])).toBe(true);
    }
  });

  it("rejects illegal jumps", () => {
    expect(canTransition(OrderStatus.Created, OrderStatus.Delivered)).toBe(false);
    expect(canTransition(OrderStatus.Paid, OrderStatus.Delivered)).toBe(false);
    expect(canTransition(OrderStatus.Ready, OrderStatus.PickedUp)).toBe(false);
    expect(canTransition(OrderStatus.Preparing, OrderStatus.RiderAssigned)).toBe(
      false,
    );
  });

  it("treats terminal states as dead ends", () => {
    for (const terminal of [
      OrderStatus.Delivered,
      OrderStatus.Cancelled,
      OrderStatus.Rejected,
      OrderStatus.Refunded,
    ]) {
      expect(ALLOWED_TRANSITIONS[terminal]).toEqual([]);
      for (const to of Object.values(OrderStatus)) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    }
  });

  it("allows cancellation from early states but not after pickup", () => {
    expect(canTransition(OrderStatus.Created, OrderStatus.Cancelled)).toBe(true);
    expect(canTransition(OrderStatus.Paid, OrderStatus.Cancelled)).toBe(true);
    expect(canTransition(OrderStatus.PickedUp, OrderStatus.Cancelled)).toBe(
      false,
    );
  });

  it("routes READY to a rider or to no-rider-found, and lets that recover", () => {
    expect(canTransition(OrderStatus.Ready, OrderStatus.RiderAssigned)).toBe(
      true,
    );
    expect(canTransition(OrderStatus.Ready, OrderStatus.NoRiderFound)).toBe(true);
    expect(canTransition(OrderStatus.NoRiderFound, OrderStatus.Cancelled)).toBe(
      true,
    );
    expect(canTransition(OrderStatus.NoRiderFound, OrderStatus.Refunded)).toBe(
      true,
    );
  });

  it("has an entry for every known status (no missing states)", () => {
    for (const status of Object.values(OrderStatus)) {
      expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
    }
  });
});
