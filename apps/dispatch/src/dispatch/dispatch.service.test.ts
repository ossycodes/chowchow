import { describe, expect, it } from "vitest";
import { DispatchEventType } from "@chowdeck/contracts";
import {
  AssignmentStatus,
  DispatchService,
  RiderStatus,
} from "./dispatch.service";
import { assignments, outboxEvents, riders } from "../db/schema";
import type { GeoPoint } from "./geo";

const ORDER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VENDOR = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CUSTOMER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/** Minimal EventEmitter2 stub — we only assert DB writes here. */
const events = { emit: () => true } as never;

/** Vendor-location port stubs. */
const vendorAt = (loc: GeoPoint | null) =>
  ({ getVendorLocation: async () => loc }) as never;

function tableName(t: unknown): string {
  if (t === assignments) return "assignments";
  if (t === riders) return "riders";
  if (t === outboxEvents) return "outbox";
  return "?";
}

/**
 * drizzle mock. `existing` = the assignment lookup result; `online` = the ONLINE riders
 * query result. `.where()` resolves to the current table's rows (and also exposes `.limit()`
 * for the assignment existence check).
 */
function mockDb(opts: { existing?: unknown[]; online?: unknown[] }) {
  const inserted: Record<string, unknown> = {};
  const updated: Record<string, unknown> = {};
  let table = "";

  const rowsFor = () =>
    table === "assignments"
      ? (opts.existing ?? [])
      : table === "riders"
        ? (opts.online ?? [])
        : [];

  const builder = {
    from(t: unknown) {
      table = tableName(t);
      return builder;
    },
    where() {
      const p = Promise.resolve(rowsFor()) as Promise<unknown[]> & {
        limit?: () => Promise<unknown[]>;
      };
      p.limit = () => Promise.resolve(rowsFor());
      return p;
    },
  };

  const writer = {
    insert: (t: unknown) => ({
      values: (v: unknown) => {
        inserted[tableName(t)] = v;
        return Promise.resolve();
      },
    }),
    update: (t: unknown) => ({
      set: (v: unknown) => ({
        where: () => {
          updated[tableName(t)] = v;
          return Promise.resolve();
        },
      }),
    }),
  };

  const db = {
    select: () => builder,
    ...writer,
    transaction: (cb: (tx: unknown) => Promise<void>) => cb(writer),
  };
  return { db, inserted, updated };
}

const rider = (id: string, extra: Partial<{ lat: number; lng: number; updatedAt: Date }> = {}) => ({
  id,
  status: RiderStatus.Online,
  lat: null,
  lng: null,
  updatedAt: new Date("2020-01-01"),
  ...extra,
});

describe("DispatchService.assignForOrder — rider selection", () => {
  it("assigns the NEAREST online rider when vendor + riders have coordinates", async () => {
    const near = rider("near", { lat: 6.51, lng: 3.31 });
    const far = rider("far", { lat: 6.7, lng: 3.6 });
    const { db, inserted, updated } = mockDb({ existing: [], online: [far, near] });
    const svc = new DispatchService(
      { db } as never,
      events,
      vendorAt({ lat: 6.5, lng: 3.3 }),
    );

    await svc.assignForOrder(ORDER, VENDOR, CUSTOMER);

    expect((inserted.assignments as { riderId: string }).riderId).toBe("near");
    expect(updated.riders).toMatchObject({ status: RiderStatus.Busy });
    expect((inserted.outbox as { envelope: { type: string } }).envelope.type).toBe(
      DispatchEventType.RiderAssigned,
    );
  });

  it("falls back to the least-recently-updated rider when vendor has no location", async () => {
    const oldest = rider("oldest", { updatedAt: new Date("2020-01-01") });
    const newer = rider("newer", { updatedAt: new Date("2024-01-01") });
    const { db, inserted } = mockDb({ existing: [], online: [newer, oldest] });
    const svc = new DispatchService({ db } as never, events, vendorAt(null));

    await svc.assignForOrder(ORDER, VENDOR, CUSTOMER);

    expect((inserted.assignments as { riderId: string }).riderId).toBe("oldest");
  });

  it("records a PENDING assignment and emits nothing when no rider is online", async () => {
    const { db, inserted } = mockDb({ existing: [], online: [] });
    const svc = new DispatchService({ db } as never, events, vendorAt({ lat: 6.5, lng: 3.3 }));

    await svc.assignForOrder(ORDER, VENDOR, CUSTOMER);

    const assignment = inserted.assignments as { status: string; riderId: string | null };
    expect(assignment.status).toBe(AssignmentStatus.Pending);
    expect(assignment.riderId).toBeNull();
    expect(inserted.outbox).toBeUndefined();
  });

  it("is idempotent: skips when the order already has an assignment", async () => {
    const { db, inserted } = mockDb({
      existing: [{ id: "existing", orderId: ORDER }],
      online: [rider("r1")],
    });
    const svc = new DispatchService({ db } as never, events, vendorAt(null));

    await svc.assignForOrder(ORDER, VENDOR, CUSTOMER);

    expect(inserted.assignments).toBeUndefined();
    expect(inserted.outbox).toBeUndefined();
  });
});
