import { join } from "node:path";

/**
 * Shared metadata + message types for the catalog gRPC contract (proto/catalog.proto).
 *
 * We use the NestJS/`@grpc/proto-loader` approach: the `.proto` is loaded at RUNTIME (no
 * code-generation step), and we hand-write the matching TypeScript types here so both the
 * server (catalog) and clients (order) share one typed definition. Keep these in lockstep
 * with the `.proto` file.
 */

/** proto `package` — namespaces the service; must match `package` in catalog.proto. */
export const CATALOG_PACKAGE = "chowdeck.catalog.v1";

/** proto `service` name — used by the server's @GrpcMethod and the client lookup. */
export const CATALOG_SERVICE_NAME = "Catalog";

/**
 * Absolute path to catalog.proto, resolved from this compiled file's location.
 * At runtime this module is `<contracts>/dist/grpc/catalog.js`, so the proto (kept at the
 * package root under `proto/`) is two levels up. Works through the pnpm workspace symlink.
 */
export const CATALOG_PROTO_PATH = join(
  __dirname,
  "..",
  "..",
  "proto",
  "catalog.proto",
);

// --- message types (camelCase: proto-loader maps snake_case fields by default) ---

export interface CatalogItemMessage {
  id: string;
  vendorId: string;
  name: string;
  priceKobo: number; // int64 in proto; loaded as a JS number via `longs: Number`.
  isAvailable: boolean;
}

export interface GetItemsRequest {
  ids: string[];
}

export interface GetItemsResponse {
  items: CatalogItemMessage[];
}

export interface GetVendorRequest {
  id: string;
}

export interface VendorMessage {
  id: string; // empty when the vendor was not found
  name: string;
  isOpen: boolean;
  hasLocation: boolean;
  lat: number;
  lng: number;
}
