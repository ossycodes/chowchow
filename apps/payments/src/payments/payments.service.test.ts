import { describe, expect, it, vi } from "vitest";
import {
  PaymentEventType,
  PaymentStatus,
  type OrderCreated,
} from "@chowdeck/contracts";
import { PaymentsService } from "./payments.service";
import type { PaymentProvider } from "./payment-provider";

const ORDER: OrderCreated = {
  orderId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  customerId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  vendorId: "vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv",
  totalKobo: 500000,
  status: "CREATED",
};

const provider = (result: { success: boolean; reason?: string }): PaymentProvider => ({
  charge: async () => ({
    success: result.success,
    providerRef: "prov_ref_123",
    reason: result.reason,
  }),
});

/** Captures inserts/updates by table so we can assert without a real DB. */
function captureDb(opts: { insertThrows?: { code: string } } = {}) {
  const writes: Record<string, unknown> = {};
  const setCalls: Record<string, unknown>[] = [];
  const tx = {
    update: () => ({
      set: (v: Record<string, unknown>) => ({ where: () => {
        setCalls.push(v);
        return Promise.resolve();
      } }),
    }),
    insert: () => ({
      values: (v: unknown) => {
        writes.outbox = v;
        return Promise.resolve();
      },
    }),
  };
  const db = {
    insert: () => ({
      values: () => {
        if (opts.insertThrows) return Promise.reject(opts.insertThrows);
        return Promise.resolve();
      },
    }),
    transaction: async (cb: (tx: unknown) => Promise<void>) => cb(tx),
  };
  return { db, writes, setCalls };
}

describe("PaymentsService.handleOrderCreated", () => {
  it("charges and stages a payment.succeeded event on success", async () => {
    const { db, writes, setCalls } = captureDb();
    const svc = new PaymentsService({ db } as never, provider({ success: true }));

    await svc.handleOrderCreated(ORDER);

    // payment marked SUCCEEDED
    expect(setCalls.some((s) => s.status === PaymentStatus.Succeeded)).toBe(true);
    // outbox event is payment.succeeded with the right amount
    const outbox = writes.outbox as { envelope: { type: string; payload: { amountKobo: number } } };
    expect(outbox.envelope.type).toBe(PaymentEventType.Succeeded);
    expect(outbox.envelope.payload.amountKobo).toBe(500000);
  });

  it("stages a payment.failed event when the provider declines", async () => {
    const { db, writes, setCalls } = captureDb();
    const svc = new PaymentsService(
      { db } as never,
      provider({ success: false, reason: "insufficient funds" }),
    );

    await svc.handleOrderCreated(ORDER);

    expect(setCalls.some((s) => s.status === PaymentStatus.Failed)).toBe(true);
    const outbox = writes.outbox as { envelope: { type: string } };
    expect(outbox.envelope.type).toBe(PaymentEventType.Failed);
  });

  it("is idempotent: a duplicate order (unique orderId) never charges twice", async () => {
    const { db } = captureDb({ insertThrows: { code: "ER_DUP_ENTRY" } });
    const charge = vi.fn();
    const svc = new PaymentsService({ db } as never, {
      charge,
    } as unknown as PaymentProvider);

    await svc.handleOrderCreated(ORDER);

    expect(charge).not.toHaveBeenCalled(); // skipped before charging
  });
});
