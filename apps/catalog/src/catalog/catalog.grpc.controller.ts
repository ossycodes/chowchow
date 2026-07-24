import { Controller } from "@nestjs/common";
import { GrpcMethod } from "@nestjs/microservices";
import {
  CATALOG_SERVICE_NAME,
  type CatalogItemMessage,
  type GetItemsRequest,
  type GetItemsResponse,
} from "@chowdeck/contracts";
import { CatalogService, type MenuItemRecord } from "./catalog.service";

/**
 * gRPC handlers for the internal Catalog service. Unlike an HTTP @Controller, there are no
 * routes/verbs — @GrpcMethod maps a class method to an `rpc` in catalog.proto by
 * (serviceName, methodName). This controller is reached only over the gRPC port, not HTTP.
 */
@Controller()
export class CatalogGrpcController {
  constructor(private readonly catalog: CatalogService) {}

  @GrpcMethod(CATALOG_SERVICE_NAME, "GetItems")
  async getItems(request: GetItemsRequest): Promise<GetItemsResponse> {
    const rows = await this.catalog.getItemsByIds(request.ids ?? []);
    return { items: rows.map(toMessage) };
  }
}

/** Map the DB row to the proto message shape (drops internal columns like createdAt). */
function toMessage(row: MenuItemRecord): CatalogItemMessage {
  return {
    id: row.id,
    vendorId: row.vendorId,
    name: row.name,
    priceKobo: row.priceKobo,
    isAvailable: row.isAvailable,
  };
}
