/**
 * DI tokens for the catalog dependency.
 * - CATALOG_PRICE_READER: the port the order service depends on (adapter-agnostic).
 * - CATALOG_GRPC_CLIENT: the underlying NestJS gRPC ClientGrpc, injected into the adapter.
 * Kept in their own file to avoid a circular import between the module and the adapter.
 */
export const CATALOG_PRICE_READER = Symbol("CATALOG_PRICE_READER");
export const CATALOG_GRPC_CLIENT = Symbol("CATALOG_GRPC_CLIENT");
