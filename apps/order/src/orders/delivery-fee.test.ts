import { describe, expect, it } from "vitest";
import { feeFromKm, haversineKm } from "./delivery-fee";

const cfg = { baseKobo: 30000, perKmKobo: 5000, flatKobo: 50000 };

describe("feeFromKm", () => {
  it("is just the base fee for a zero-distance route", () => {
    expect(feeFromKm(0, cfg)).toBe(30000);
  });

  it("adds perKm × distance (base + rounded distance component)", () => {
    expect(feeFromKm(4, cfg)).toBe(30000 + 5000 * 4);
    expect(feeFromKm(4, cfg)).toBeGreaterThan(30000);
  });

  it("rounds the per-km component to whole kobo", () => {
    expect(feeFromKm(2.3456, cfg)).toBe(30000 + Math.round(5000 * 2.3456));
  });
});

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm({ lat: 6.5, lng: 3.3 }, { lat: 6.5, lng: 3.3 })).toBe(0);
  });

  it("grows with separation (~15 km for these Lagos points)", () => {
    const km = haversineKm({ lat: 6.5, lng: 3.3 }, { lat: 6.6, lng: 3.4 });
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(20);
  });
});
