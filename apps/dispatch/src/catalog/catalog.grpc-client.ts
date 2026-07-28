import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { ClientGrpc } from "@nestjs/microservices";
import { firstValueFrom, type Observable } from "rxjs";
import {
  CATALOG_SERVICE_NAME,
  type GetVendorRequest,
  type VendorMessage,
} from "@chowdeck/contracts";
import type { GeoPoint } from "../dispatch/geo";
import type { VendorLocationReader } from "./vendor-location-reader";
import { CATALOG_GRPC_CLIENT } from "./catalog.tokens";

interface CatalogGrpc {
  getVendor(request: GetVendorRequest): Observable<VendorMessage>;
}

/**
 * gRPC adapter for {@link VendorLocationReader}. Dispatch is a client of catalog's internal
 * Catalog service (the same one order uses for pricing) — here for the vendor's pickup point.
 */
@Injectable()
export class CatalogGrpcClient implements VendorLocationReader, OnModuleInit {
  private catalog!: CatalogGrpc;

  constructor(
    @Inject(CATALOG_GRPC_CLIENT) private readonly client: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.catalog = this.client.getService<CatalogGrpc>(CATALOG_SERVICE_NAME);
  }

  async getVendorLocation(vendorId: string): Promise<GeoPoint | null> {
    const vendor = await firstValueFrom(
      this.catalog.getVendor({ id: vendorId }),
    );
    // empty id = not found; hasLocation=false = vendor exists but has no coordinates.
    if (!vendor.id || !vendor.hasLocation) return null;
    return { lat: vendor.lat, lng: vendor.lng };
  }
}
