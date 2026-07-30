import { describe, expect, it } from "vitest";
import { computeDeliveryFee, haversineKm } from "./delivery-fee";

const cfg = { baseKobo: 30000, perKmKobo: 5000, flatKobo: 50000 };
const vendor = { lat: 6.5, lng: 3.3 };

describe("computeDeliveryFee", () => {
  it("falls back to the flat fee when either location is missing", () => {
    expect(computeDeliveryFee(null, { lat: 6.6, lng: 3.4 }, cfg)).toBe(50000);
    expect(computeDeliveryFee(vendor, null, cfg)).toBe(50000);
  });

  it("is just the base fee for a zero-distance delivery", () => {
    expect(computeDeliveryFee(vendor, { ...vendor }, cfg)).toBe(30000);
  });

  it("adds perKm × distance (base + rounded distance component)", () => {
    const customer = { lat: 6.6, lng: 3.4 };
    const km = haversineKm(vendor, customer);
    expect(computeDeliveryFee(vendor, customer, cfg)).toBe(
      30000 + Math.round(5000 * km),
    );
    // ~15 km apart → clearly more than the base
    expect(computeDeliveryFee(vendor, customer, cfg)).toBeGreaterThan(30000);
  });
});
