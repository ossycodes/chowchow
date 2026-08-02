import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { OrderStatus, type CatalogItemMessage } from "@chowdeck/contracts";
import { OrdersService } from "./orders.service";
import { feeFromKm, type GeoPoint } from "./delivery-fee";
import type { DistanceProvider, Route } from "./distance/distance-provider";
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
function fakeCatalog(
  items: CatalogItemMessage[],
  vendorLocation: GeoPoint | null = null,
): CatalogPriceReader {
  return {
    getItems: async () => items,
    getVendorLocation: async () => vendorLocation,
  };
}

/** A fake distance provider returning a fixed route (or null to force the flat-fee fallback). */
function fakeDistance(route: Route | null): DistanceProvider {
  return { roadDistance: async () => route };
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
      fakeDistance(null),
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
      fakeDistance(null),
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
      fakeDistance(null),
    );
    await expect(
      svc.checkout(CUSTOMER, {
        vendorId: VENDOR,
        items: [{ itemId: ITEM_A, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("prices from the catalog (not the client) and computes subtotal + delivery fee", async () => {
    process.env.DELIVERY_FEE_KOBO = "50000";
    const { db, inserted } = captureDb();
    const svc = new OrdersService(
      { db } as never,
      fakeCatalog([
        item({ id: ITEM_A, priceKobo: 250000 }),
        item({ id: ITEM_B, priceKobo: 100000 }),
      ]),
      fakeDistance(null), // no locations → flat fee
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

    const order = inserted.order as {
      totalKobo: number;
      deliveryFeeKobo: number;
      status: string;
    };
    const items = inserted.items as Array<{
      unitPriceKobo: number;
      lineTotalKobo: number;
      quantity: number;
    }>;
    // subtotal 2×250000 + 3×100000 = 800000; + ₦500 delivery = 850000
    expect(order.deliveryFeeKobo).toBe(50000);
    expect(order.totalKobo).toBe(850000);
    expect(order.status).toBe(OrderStatus.Created);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ unitPriceKobo: 250000, lineTotalKobo: 500000 });
    expect(items[1]).toMatchObject({ unitPriceKobo: 100000, lineTotalKobo: 300000 });
    // the order.created event carries the breakdown (subtotal + fee = total)
    const outbox = inserted.outbox as {
      envelope: { payload: { subtotalKobo: number; deliveryFeeKobo: number; totalKobo: number } };
    };
    expect(outbox.envelope.payload).toMatchObject({
      subtotalKobo: 800000,
      deliveryFeeKobo: 50000,
      totalKobo: 850000,
    });
  });

  it("uses the provider's road distance for the fee + ETA when locations are known", async () => {
    process.env.DELIVERY_FEE_BASE_KOBO = "30000";
    process.env.DELIVERY_FEE_PER_KM_KOBO = "5000";
    const vendorLoc = { lat: 6.5, lng: 3.3 };
    const customerLoc = { lat: 6.6, lng: 3.4 };
    const route = { km: 6, etaMinutes: 14.6 };
    const { db, inserted } = captureDb();
    const svc = new OrdersService(
      { db } as never,
      fakeCatalog([item({ id: ITEM_A, priceKobo: 250000 })], vendorLoc),
      fakeDistance(route),
    );
    vi.spyOn(svc, "getForCustomer").mockResolvedValue({
      order: {} as never,
      items: [],
    });

    await svc.checkout(CUSTOMER, {
      vendorId: VENDOR,
      items: [{ itemId: ITEM_A, quantity: 1 }],
      deliveryLat: customerLoc.lat,
      deliveryLng: customerLoc.lng,
    });

    const order = inserted.order as {
      deliveryFeeKobo: number;
      deliveryLat: number;
      etaMinutes: number;
      totalKobo: number;
    };
    const expectedFee = feeFromKm(route.km, {
      baseKobo: 30000,
      perKmKobo: 5000,
      flatKobo: 50000,
    });
    expect(expectedFee).toBe(30000 + 5000 * 6);
    expect(order.deliveryFeeKobo).toBe(expectedFee);
    expect(order.deliveryLat).toBe(customerLoc.lat);
    expect(order.etaMinutes).toBe(15); // rounded from 14.6
    expect(order.totalKobo).toBe(250000 + expectedFee);
  });

  it("falls back to the flat fee (and no ETA) when the provider can't route", async () => {
    process.env.DELIVERY_FEE_KOBO = "50000";
    const vendorLoc = { lat: 6.5, lng: 3.3 };
    const { db, inserted } = captureDb();
    const svc = new OrdersService(
      { db } as never,
      fakeCatalog([item({ id: ITEM_A, priceKobo: 250000 })], vendorLoc),
      fakeDistance(null),
    );
    vi.spyOn(svc, "getForCustomer").mockResolvedValue({
      order: {} as never,
      items: [],
    });

    await svc.checkout(CUSTOMER, {
      vendorId: VENDOR,
      items: [{ itemId: ITEM_A, quantity: 1 }],
      deliveryLat: 6.6,
      deliveryLng: 3.4,
    });

    const order = inserted.order as {
      deliveryFeeKobo: number;
      etaMinutes: number | null;
    };
    expect(order.deliveryFeeKobo).toBe(50000);
    expect(order.etaMinutes).toBeNull();
  });
});
