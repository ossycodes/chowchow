import type { GeoPoint } from "../delivery-fee";

/** DI token for the distance provider port. */
export const DISTANCE_PROVIDER = Symbol("DISTANCE_PROVIDER");

export interface Route {
  /** Route distance in km (road distance for real providers). */
  km: number;
  /** Estimated travel time in minutes. */
  etaMinutes: number;
}

/**
 * Port: how the order service measures the delivery route from the vendor to the customer.
 * The default adapter approximates road distance from straight-line distance; a real maps
 * adapter (OSRM/Google) returns true road distance + ETA. Returns null if it can't compute a
 * route (the caller then falls back to the flat delivery fee).
 */
export interface DistanceProvider {
  roadDistance(from: GeoPoint, to: GeoPoint): Promise<Route | null>;
}
