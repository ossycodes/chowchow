import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { menuItems, vendors } from "../db/schema";
import type { CreateVendorRequest } from "./dto/create-vendor.request";
import type { CreateItemRequest } from "./dto/create-item.request";
import type { UpdateItemRequest } from "./dto/update-item.request";

export type VendorRecord = typeof vendors.$inferSelect;
export type MenuItemRecord = typeof menuItems.$inferSelect;

interface MysqlError {
  code?: string;
}

/** Turns "Mama's Kitchen" into "mamas-kitchen". */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

@Injectable()
export class CatalogService {
  constructor(private readonly dbService: DbService) {}

  // --- vendors ---

  async createVendor(input: CreateVendorRequest): Promise<VendorRecord> {
    const id = randomUUID();
    const slug = input.slug ?? slugify(input.name);
    try {
      await this.dbService.db.insert(vendors).values({
        id,
        name: input.name,
        slug,
        description: input.description,
      });
    } catch (err) {
      if ((err as MysqlError).code === "ER_DUP_ENTRY") {
        throw new ConflictException(`vendor slug "${slug}" already exists`);
      }
      throw err;
    }
    return this.getVendorOrThrow(id);
  }

  async listVendors(): Promise<VendorRecord[]> {
    return this.dbService.db.select().from(vendors);
  }

  async getVendorOrThrow(id: string): Promise<VendorRecord> {
    const [row] = await this.dbService.db
      .select()
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1);
    if (!row) throw new NotFoundException("vendor not found");
    return row;
  }

  // --- menu items ---

  async addItem(
    vendorId: string,
    input: CreateItemRequest,
  ): Promise<MenuItemRecord> {
    // Ensure the vendor exists (→ 404) before creating a dangling item.
    await this.getVendorOrThrow(vendorId);
    const id = randomUUID();
    await this.dbService.db.insert(menuItems).values({
      id,
      vendorId,
      name: input.name,
      description: input.description,
      priceKobo: input.priceKobo,
      isAvailable: input.isAvailable ?? true,
    });
    return this.getItemOrThrow(id);
  }

  async listItems(vendorId: string): Promise<MenuItemRecord[]> {
    // 404 if the vendor doesn't exist, so callers can tell "no menu" from "no vendor".
    await this.getVendorOrThrow(vendorId);
    return this.dbService.db
      .select()
      .from(menuItems)
      .where(eq(menuItems.vendorId, vendorId));
  }

  /**
   * Batch-fetch items by id (used by the internal gRPC API at order checkout). Unknown ids
   * are simply absent from the result — the caller decides how to treat missing lines.
   */
  async getItemsByIds(ids: string[]): Promise<MenuItemRecord[]> {
    if (ids.length === 0) return [];
    return this.dbService.db
      .select()
      .from(menuItems)
      .where(inArray(menuItems.id, ids));
  }

  async getItemOrThrow(id: string): Promise<MenuItemRecord> {
    const [row] = await this.dbService.db
      .select()
      .from(menuItems)
      .where(eq(menuItems.id, id))
      .limit(1);
    if (!row) throw new NotFoundException("item not found");
    return row;
  }

  async updateItem(
    id: string,
    input: UpdateItemRequest,
  ): Promise<MenuItemRecord> {
    // Confirm it exists first so a missing item is a clean 404, not a silent no-op.
    await this.getItemOrThrow(id);
    await this.dbService.db
      .update(menuItems)
      .set(input)
      .where(eq(menuItems.id, id));
    return this.getItemOrThrow(id);
  }
}
