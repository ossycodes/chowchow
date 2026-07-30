import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { ClientGrpc } from "@nestjs/microservices";
import { firstValueFrom, type Observable } from "rxjs";
import {
  CATALOG_SERVICE_NAME,
  type CatalogItemMessage,
  type GetItemsRequest,
  type GetItemsResponse,
  type GetVendorRequest,
  type VendorMessage,
} from "@chowdeck/contracts";
import type { GeoPoint } from "../orders/delivery-fee";
import type { CatalogPriceReader } from "./catalog-price-reader";
import { CATALOG_GRPC_CLIENT } from "./catalog.tokens";

/** The generated-at-runtime shape of the Catalog gRPC service (methods return Observables). */
interface CatalogGrpc {
  getItems(request: GetItemsRequest): Observable<GetItemsResponse>;
  getVendor(request: GetVendorRequest): Observable<VendorMessage>;
}

/**
 * gRPC adapter for {@link CatalogPriceReader}. NestJS builds a lazy client from the proto;
 * `getService` resolves the concrete methods on first init. We convert the RPC's Observable
 * to a Promise with `firstValueFrom` so callers get a plain async API.
 */
@Injectable()
export class CatalogGrpcClient implements CatalogPriceReader, OnModuleInit {
  private catalog!: CatalogGrpc;

  constructor(
    @Inject(CATALOG_GRPC_CLIENT) private readonly client: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.catalog = this.client.getService<CatalogGrpc>(CATALOG_SERVICE_NAME);
  }

  async getItems(ids: string[]): Promise<CatalogItemMessage[]> {
    if (ids.length === 0) return [];
    const res = await firstValueFrom(this.catalog.getItems({ ids }));
    // proto3 omits an empty repeated field, so `items` can be undefined.
    return res.items ?? [];
  }

  async getVendorLocation(vendorId: string): Promise<GeoPoint | null> {
    const v = await firstValueFrom(this.catalog.getVendor({ id: vendorId }));
    // empty id = not found; hasLocation=false = vendor exists but has no coordinates.
    if (!v.id || !v.hasLocation) return null;
    return { lat: v.lat, lng: v.lng };
  }
}
