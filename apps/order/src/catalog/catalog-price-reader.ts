import type { CatalogItemMessage } from "@chowdeck/contracts";
import type { GeoPoint } from "../orders/delivery-fee";

/**
 * Port: how the order service reads authoritative catalog data at checkout (item prices, and
 * the vendor's pickup location for the delivery-fee distance). The order domain depends on
 * THIS interface, not on gRPC — so the transport can change without touching checkout logic.
 */
export interface CatalogPriceReader {
  /** Batch-fetch items by id. Unknown ids are simply absent from the result. */
  getItems(ids: string[]): Promise<CatalogItemMessage[]>;
  /** The vendor's pickup location, or null if unknown / no coordinates. */
  getVendorLocation(vendorId: string): Promise<GeoPoint | null>;
}
