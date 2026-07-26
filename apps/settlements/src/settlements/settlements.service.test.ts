import { describe, expect, it, vi } from "vitest";
import {
  SettlementEventType,
  type PaymentSucceeded,
} from "@chowdeck/contracts";
import { SettlementsService } from "./settlements.service";

const VENDOR = "vvvvvvvv-vvvv-vvvv-vvvv-vvvvvvvvvvvv";

function payment(paymentId: string, amountKobo: number): PaymentSucceeded {
  return {
    paymentId,
    orderId: "oooooooo-oooo-oooo-oooo-oooooooooooo",
    customerId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    vendorId: VENDOR,
    amountKobo,
    providerRef: "ref",
  };
}

describe("SettlementsService.recordEarning", () => {
  it("is idempotent: a duplicate paymentId is skipped", async () => {
    const insert = vi.fn(() => ({
      values: () => Promise.reject({ code: "ER_DUP_ENTRY" }),
    }));
    const svc = new SettlementsService({ db: { insert } } as never);
    await expect(svc.recordEarning(payment("p1", 100))).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledOnce();
  });
});

describe("SettlementsService.runAll", () => {
  it("pays out a vendor's unsettled earnings as one settlement + event", async () => {
    const captured: Record<string, unknown> = {};
    // getBalances reads all unsettled earnings; the per-vendor query returns ids+amounts.
    const unsettledRows = [
      { id: "e1", vendorId: VENDOR, amountKobo: 300000, settlementId: null },
      { id: "e2", vendorId: VENDOR, amountKobo: 200000, settlementId: null },
    ];
    let selectCall = 0;
    const db = {
      select: () => ({
        from: () => ({
          where: () => {
            // 1st select (getBalances) returns full rows; 2nd returns {id, amountKobo}
            selectCall += 1;
            return selectCall === 1
              ? Promise.resolve(unsettledRows)
              : Promise.resolve(
                  unsettledRows.map((r) => ({ id: r.id, amountKobo: r.amountKobo })),
                );
          },
        }),
      }),
      transaction: async (cb: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: () => ({
            values: (v: unknown) => {
              const val = v as Record<string, unknown>;
              if ("earningsCount" in val) captured.settlement = val;
              else if ("topic" in val) captured.outbox = val;
              return Promise.resolve();
            },
          }),
          update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
        };
        return cb(tx);
      },
    };
    const svc = new SettlementsService({ db } as never);

    const created = await svc.runAll();

    expect(created).toHaveLength(1);
    const s = captured.settlement as { amountKobo: number; earningsCount: number };
    expect(s.amountKobo).toBe(500000); // 300000 + 200000
    expect(s.earningsCount).toBe(2);
    const outbox = captured.outbox as {
      envelope: { type: string; payload: { amountKobo: number } };
    };
    expect(outbox.envelope.type).toBe(SettlementEventType.Completed);
    expect(outbox.envelope.payload.amountKobo).toBe(500000);
  });

  it("does nothing when no vendor is owed", async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    };
    const svc = new SettlementsService({ db } as never);
    expect(await svc.runAll()).toEqual([]);
  });
});
