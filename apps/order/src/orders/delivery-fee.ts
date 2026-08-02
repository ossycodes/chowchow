export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle ("as the crow flies") distance between two lat/lng points in km. */
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
  /** Added per km of the delivery route (kobo). */
  perKmKobo: number;
  /** Flat fee used when we can't compute a distance (missing coordinates / provider error). */
  flatKobo: number;
}

/** Delivery fee (kobo) for a known route distance: base + perKm × km, integer kobo. */
export function feeFromKm(km: number, cfg: DeliveryFeeConfig): number {
  return cfg.baseKobo + Math.round(cfg.perKmKobo * km);
}
