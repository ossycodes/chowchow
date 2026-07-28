import type { GeoPoint } from "../dispatch/geo";

/**
 * Port: how dispatch learns a vendor's pickup location (to match the nearest rider). The
 * dispatch domain depends on THIS, not on gRPC — so the transport can change without touching
 * the assignment logic. Returns null when the vendor is unknown or has no coordinates.
 */
export interface VendorLocationReader {
  getVendorLocation(vendorId: string): Promise<GeoPoint | null>;
}
