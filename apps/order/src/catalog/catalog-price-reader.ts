import type { CatalogItemMessage } from "@chowdeck/contracts";

/**
 * Port: how the order service reads authoritative item data (price, availability, vendor)
 * at checkout. The order domain depends on THIS interface, not on gRPC — so the transport
 * (currently gRPC, could later be an event-sourced local cache) can change without touching
 * checkout logic. See the order→catalog design discussion (Option B: gRPC).
 */
export interface CatalogPriceReader {
  /** Batch-fetch items by id. Unknown ids are simply absent from the result. */
  getItems(ids: string[]): Promise<CatalogItemMessage[]>;
}
