export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two lat/lng points in kilometres (haversine formula).
 * Good enough for rider matching over city distances.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Pick the point nearest to `origin`. Returns null for an empty list. Ties resolve to the
 * first candidate (stable), which keeps behaviour deterministic.
 */
export function pickNearest<T extends GeoPoint>(
  origin: GeoPoint,
  points: T[],
): T | null {
  let best: T | null = null;
  let bestKm = Infinity;
  for (const p of points) {
    const km = haversineKm(origin, p);
    if (km < bestKm) {
      best = p;
      bestKm = km;
    }
  }
  return best;
}
