import { describe, expect, it } from "vitest";
import { haversineKm, pickNearest } from "./geo";

// Reference points around Lagos.
const yaba = { lat: 6.5095, lng: 3.3711 };
const ikeja = { lat: 6.6018, lng: 3.3515 };
const lekki = { lat: 6.4698, lng: 3.5852 };

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm(yaba, yaba)).toBe(0);
  });

  it("is symmetric and roughly correct for a known distance", () => {
    const d = haversineKm(yaba, ikeja);
    expect(d).toBeCloseTo(haversineKm(ikeja, yaba), 6);
    expect(d).toBeGreaterThan(9); // ~10 km
    expect(d).toBeLessThan(12);
  });
});

describe("pickNearest", () => {
  it("returns null for an empty list", () => {
    expect(pickNearest(yaba, [])).toBeNull();
  });

  it("picks the closest point to the origin", () => {
    const nearest = pickNearest(yaba, [
      { id: "lekki", ...lekki },
      { id: "ikeja", ...ikeja },
    ]);
    expect(nearest?.id).toBe("ikeja"); // ikeja is closer to yaba than lekki
  });

  it("returns the single candidate when there's only one", () => {
    expect(pickNearest(yaba, [{ id: "only", ...lekki }])?.id).toBe("only");
  });
});
