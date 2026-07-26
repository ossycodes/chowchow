import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { OrderStatus, type CatalogItemMessage } from "@chowdeck/contracts";
import { OrdersService } from "./orders.service";
import type { CatalogPriceReader } from "../catalog/catalog-price-reader";

const VENDOR = "11111111-1111-1111-1111-111111111111";
const CUSTOMER = "22222222-2222-2222-2222-222222222222";
const ITEM_A = "33333333-3333-3333-3333-3333333333aa";
const ITEM_B = "33333333-3333-3333-3333-3333333333bb";

function item(overrides: Partial<CatalogItemMessage> = {}): CatalogItemMessage {
  return {
    id: ITEM_A,
    vendorId: VENDOR,
    name: "Jollof",
    priceKobo: 250000,
    isAvailable: true,
    ...overrides,
  };
}

/** A fake catalog port — the whole point of ports/adapters: no gRPC needed to test. */
function fakeCatalog(items: CatalogItemMessage[]): CatalogPriceReader {
  return { getItems: async () => items };
}

/** Captures what checkout would insert, so we can assert prices/totals without a real DB. */
function captureDb() {
  const inserted: Record<string, unknown> = {};
  const tx = {
    insert: (table: unknown) => ({
      values: (vals: unknown) => {
        // identify the table by which columns the values carry
        const v = vals as Record<string, unknown>;
        if ("totalKobo" in v) inserted.order = v;
        else if (Array.isArray(vals)) inserted.items = vals;
        else if ("topic" in v) inserted.outbox = v;
        return Promise.resolve();
      },
    }),
  };
  const db = {
    transaction: async (cb: (tx: unknown) => Promise<void>) => cb(tx),
  };
  return { db, inserted };
}

describe("OrdersService.checkout — pricing & validation", () => {
  it("rejects an item id the catalog doesn't know", async () => {
    const svc = new OrdersService(
      { db: {} } as never,
      fakeCatalog([]), // catalog returns nothing for the requested id
    );
    await expect(
      svc.checkout(CUSTOMER, {
        vendorId: VENDOR,
        items: [{ itemId: ITEM_A, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an item that belongs to a different vendor", async () => {
    const svc = new OrdersService(
      { db: {} } as never,
      fakeCatalog([item({ vendorId: "99999999-9999-9999-9999-999999999999" })]),
    );
    await expect(
      svc.checkout(CUSTOMER, {
        vendorId: VENDOR,
        items: [{ itemId: ITEM_A, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an unavailable item with a conflict", async () => {
    const svc = new OrdersService(
      { db: {} } as never,
      fakeCatalog([item({ isAvailable: false })]),
    );
    await expect(
      svc.checkout(CUSTOMER, {
        vendorId: VENDOR,
        items: [{ itemId: ITEM_A, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("prices from the catalog (not the client) and computes the total in kobo", async () => {
    const { db, inserted } = captureDb();
    const svc = new OrdersService(
      { db } as never,
      fakeCatalog([
        item({ id: ITEM_A, priceKobo: 250000 }),
        item({ id: ITEM_B, priceKobo: 100000 }),
      ]),
    );
    // getForCustomer reads the DB at the end — stub it, we only assert the writes.
    vi.spyOn(svc, "getForCustomer").mockResolvedValue({
      order: {} as never,
      items: [],
    });

    await svc.checkout(CUSTOMER, {
      vendorId: VENDOR,
      items: [
        { itemId: ITEM_A, quantity: 2 },
        { itemId: ITEM_B, quantity: 3 },
      ],
    });

    const order = inserted.order as { totalKobo: number; status: string };
    const items = inserted.items as Array<{
      unitPriceKobo: number;
      lineTotalKobo: number;
      quantity: number;
    }>;
    // 2×250000 + 3×100000 = 800000
    expect(order.totalKobo).toBe(800000);
    expect(order.status).toBe(OrderStatus.Created);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ unitPriceKobo: 250000, lineTotalKobo: 500000 });
    expect(items[1]).toMatchObject({ unitPriceKobo: 100000, lineTotalKobo: 300000 });
    // an order.created event was staged in the outbox (same transaction)
    expect(inserted.outbox).toBeDefined();
  });
});
