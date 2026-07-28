/**
 * DI tokens for dispatch's catalog dependency.
 * - VENDOR_LOCATION_READER: the port dispatch depends on (adapter-agnostic).
 * - CATALOG_GRPC_CLIENT: the underlying NestJS gRPC ClientGrpc injected into the adapter.
 */
export const VENDOR_LOCATION_READER = Symbol("VENDOR_LOCATION_READER");
export const CATALOG_GRPC_CLIENT = Symbol("CATALOG_GRPC_CLIENT");
