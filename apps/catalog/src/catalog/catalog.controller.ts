import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ZodValidationPipe } from "@chowdeck/nest";
import { CatalogService } from "./catalog.service";
import {
  createVendorRequestSchema,
  type CreateVendorRequest,
} from "./dto/create-vendor.request";
import {
  createItemRequestSchema,
  type CreateItemRequest,
} from "./dto/create-item.request";
import {
  updateItemRequestSchema,
  type UpdateItemRequest,
} from "./dto/update-item.request";

/**
 * Routes are namespaced under `/catalog` so the API gateway can forward the whole prefix
 * here. Reads (GET) are public browsing; writes (POST/PATCH) are protected at the gateway.
 */
@Controller("catalog")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("vendors")
  async listVendors() {
    return { vendors: await this.catalog.listVendors() };
  }

  @Post("vendors")
  async createVendor(
    @Body(new ZodValidationPipe(createVendorRequestSchema))
    body: CreateVendorRequest,
  ) {
    return { vendor: await this.catalog.createVendor(body) };
  }

  @Get("vendors/:id")
  async getVendor(@Param("id") id: string) {
    return { vendor: await this.catalog.getVendorOrThrow(id) };
  }

  @Get("vendors/:id/items")
  async listItems(@Param("id") vendorId: string) {
    return { items: await this.catalog.listItems(vendorId) };
  }

  @Post("vendors/:id/items")
  async addItem(
    @Param("id") vendorId: string,
    @Body(new ZodValidationPipe(createItemRequestSchema))
    body: CreateItemRequest,
  ) {
    return { item: await this.catalog.addItem(vendorId, body) };
  }

  @Get("items/:id")
  async getItem(@Param("id") id: string) {
    return { item: await this.catalog.getItemOrThrow(id) };
  }

  @Patch("items/:id")
  async updateItem(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateItemRequestSchema))
    body: UpdateItemRequest,
  ) {
    return { item: await this.catalog.updateItem(id, body) };
  }
}
