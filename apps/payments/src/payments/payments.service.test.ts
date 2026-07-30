import { describe, expect, it, vi } from "vitest";
import {
  PaymentEventType,
  PaymentStatus,
  type OrderCreated,
} from "@chowdeck/contracts";
import { PaymentsService } from "./payments.service";
import type {
  InitResult,
  PaymentProvider,
  WebhookResult,
} from "./payment-provider";

const ORDER: OrderCreated = {
  orderId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  customerId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  vendorId: "vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv",
  subtotalKobo: 500000,
  deliveryFeeKobo: 50000,
  totalKobo: 550000,
  status: "CREATED",
};

function provider(
  init: InitResult,
  webhook: WebhookResult | null = null,
): PaymentProvider {
  return {
    initialize: vi.fn(async () => init),
    verifyWebhook: vi.fn(() => webhook),
  };
}

/**
 * Stateful drizzle mock: the PENDING payment row is created by insert, mutated by update
 * (status/providerRef), and returned by select — so finalize can re-read it. Outbox rows are
 * collected.
 */
function mockDb(opts: { insertThrows?: { code: string } } = {}) {
  let row: Record<string, unknown> | null = null;
  const outbox: Record<string, unknown>[] = [];

  const applyInsert = (v: unknown) => {
    const val = v as Record<string, unknown>;
    if ("topic" in val) outbox.push(val);
    else if ("orderId" in val && "status" in val) row = { ...val }; // payment insert
    return Promise.resolve();
  };
  const applyUpdate = (v: Record<string, unknown>) => {
    if (row) Object.assign(row, v);
    return Promise.resolve();
  };

  const db = {
    insert: () => ({
      values: (v: unknown) => {
        if (opts.insertThrows && row === null && !("topic" in (v as object))) {
          return Promise.reject(opts.insertThrows);
        }
        return applyInsert(v);
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({ where: () => applyUpdate(v) }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(row ? [row] : []) }),
      }),
    }),
    transaction: async (cb: (tx: unknown) => Promise<void>) =>
      cb({
        update: () => ({
          set: (v: Record<string, unknown>) => ({ where: () => applyUpdate(v) }),
        }),
        insert: () => ({ values: (v: unknown) => applyInsert(v) }),
      }),
  };
  return { db, getRow: () => row, outbox };
}

describe("PaymentsService.handleOrderCreated — instant provider", () => {
  it("finalizes immediately and stages payment.succeeded with the split", async () => {
    const { db, getRow, outbox } = mockDb();
    const svc = new PaymentsService(
      { db } as never,
      provider({ providerRef: "fake_1", outcome: "succeeded" }),
    );

    await svc.handleOrderCreated(ORDER);

    expect((getRow() as { status: string }).status).toBe(
      PaymentStatus.Succeeded,
    );
    const event = outbox[0] as {
      envelope: {
        type: string;
        payload: {
          amountKobo: number;
          commissionKobo: number;
          vendorAmountKobo: number;
          deliveryFeeKobo: number;
        };
      };
    };
    expect(event.envelope.type).toBe(PaymentEventType.Succeeded);
    const p = event.envelope.payload;
    expect(p).toMatchObject({
      amountKobo: 550000,
      commissionKobo: 100000, // 20% of the 500000 food subtotal
      vendorAmountKobo: 400000,
      deliveryFeeKobo: 50000,
    });
    expect(p.vendorAmountKobo + p.commissionKobo + p.deliveryFeeKobo).toBe(
      p.amountKobo,
    );
  });

  it("is idempotent: a duplicate order (unique orderId) never initializes a charge", async () => {
    const initialize = vi.fn();
    const { db } = mockDb({ insertThrows: { code: "ER_DUP_ENTRY" } });
    const svc = new PaymentsService({ db } as never, {
      initialize,
      verifyWebhook: () => null,
    } as unknown as PaymentProvider);

    await svc.handleOrderCreated(ORDER);
    expect(initialize).not.toHaveBeenCalled();
  });
});

describe("PaymentsService — async (Paystack-style) provider", () => {
  it("leaves the payment PENDING on initialize, then succeeds on the webhook", async () => {
    const { db, getRow, outbox } = mockDb();
    const svc = new PaymentsService(
      { db } as never,
      provider(
        { providerRef: "ps_1", outcome: "pending", authorizationUrl: "https://pay" },
        { reference: ORDER.orderId, outcome: "succeeded" },
      ),
    );

    await svc.handleOrderCreated(ORDER);
    // pending: no event yet
    expect((getRow() as { status: string }).status).toBe(PaymentStatus.Pending);
    expect(outbox).toHaveLength(0);

    // the signed webhook arrives → finalize
    await svc.handleWebhook("sig", Buffer.from("{}"));
    expect((getRow() as { status: string }).status).toBe(
      PaymentStatus.Succeeded,
    );
    expect(outbox).toHaveLength(1);
    expect((outbox[0] as { envelope: { type: string } }).envelope.type).toBe(
      PaymentEventType.Succeeded,
    );
  });

  it("rejects a webhook the provider can't verify", async () => {
    const { db } = mockDb();
    const svc = new PaymentsService(
      { db } as never,
      provider({ providerRef: "ps_1", outcome: "pending" }, null),
    );
    await expect(svc.handleWebhook("bad", Buffer.from("{}"))).rejects.toThrow();
  });
});
