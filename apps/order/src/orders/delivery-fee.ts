export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two lat/lng points in km (haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export interface DeliveryFeeConfig {
  /** Fixed part of a distance-based fee (kobo). */
  baseKobo: number;
  /** Added per km of vendor→customer distance (kobo). */
  perKmKobo: number;
  /** Flat fee used when we can't compute distance (missing coordinates). */
  flatKobo: number;
}

/**
 * Delivery fee in kobo. When both the vendor's and the customer's locations are known, it's
 * `base + perKm × distance` (integer kobo). Otherwise we fall back to the flat fee — so an
 * order without coordinates still gets charged sensibly.
 */
export function computeDeliveryFee(
  vendor: GeoPoint | null,
  customer: GeoPoint | null,
  cfg: DeliveryFeeConfig,
): number {
  if (!vendor || !customer) return cfg.flatKobo;
  const km = haversineKm(vendor, customer);
  return cfg.baseKobo + Math.round(cfg.perKmKobo * km);
}
