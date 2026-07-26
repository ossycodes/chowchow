import { describe, expect, it } from "vitest";
import { DispatchEventType } from "@chowdeck/contracts";
import {
  AssignmentStatus,
  DispatchService,
  RiderStatus,
} from "./dispatch.service";
import { assignments, outboxEvents, riders } from "../db/schema";

const ORDER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VENDOR = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function tableName(t: unknown): string {
  if (t === assignments) return "assignments";
  if (t === riders) return "riders";
  if (t === outboxEvents) return "outbox";
  return "?";
}

/**
 * A hand-rolled drizzle mock. `existing` = rows the assignment lookup returns; `rider` =
 * rows the ONLINE-rider lookup returns. Captures inserts/updates by table so we can assert
 * what dispatch decided — no real MySQL needed.
 */
function mockDb(opts: { existing?: unknown[]; rider?: unknown[] }) {
  const inserted: Record<string, unknown> = {};
  const updated: Record<string, unknown> = {};
  let selectTable = "";

  const selectBuilder: Record<string, unknown> = {
    from(t: unknown) {
      selectTable = tableName(t);
      return selectBuilder;
    },
    where: () => selectBuilder,
    orderBy: () => selectBuilder,
    limit: () =>
      Promise.resolve(
        selectTable === "assignments"
          ? (opts.existing ?? [])
          : selectTable === "riders"
            ? (opts.rider ?? [])
            : [],
      ),
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
    select: () => selectBuilder,
    ...writer,
    transaction: (cb: (tx: unknown) => Promise<void>) => cb(writer),
  };

  return { db, inserted, updated };
}

describe("DispatchService.assignForOrder", () => {
  it("assigns an ONLINE rider, marks them BUSY, and stages a rider_assigned event", async () => {
    const { db, inserted, updated } = mockDb({
      existing: [],
      rider: [{ id: "rider-1", status: RiderStatus.Online }],
    });
    const svc = new DispatchService({ db } as never);

    await svc.assignForOrder(ORDER, VENDOR);

    const assignment = inserted.assignments as {
      status: string;
      riderId: string;
    };
    expect(assignment.status).toBe(AssignmentStatus.Assigned);
    expect(assignment.riderId).toBe("rider-1");
    expect(updated.riders).toMatchObject({ status: RiderStatus.Busy });

    const outbox = inserted.outbox as { envelope: { type: string } };
    expect(outbox.envelope.type).toBe(DispatchEventType.RiderAssigned);
  });

  it("records a PENDING assignment and emits nothing when no rider is online", async () => {
    const { db, inserted } = mockDb({ existing: [], rider: [] });
    const svc = new DispatchService({ db } as never);

    await svc.assignForOrder(ORDER, VENDOR);

    const assignment = inserted.assignments as {
      status: string;
      riderId: string | null;
    };
    expect(assignment.status).toBe(AssignmentStatus.Pending);
    expect(assignment.riderId).toBeNull();
    expect(inserted.outbox).toBeUndefined();
  });

  it("is idempotent: skips when the order already has an assignment", async () => {
    const { db, inserted } = mockDb({
      existing: [{ id: "existing", orderId: ORDER }],
      rider: [{ id: "rider-1" }],
    });
    const svc = new DispatchService({ db } as never);

    await svc.assignForOrder(ORDER, VENDOR);

    // nothing new written
    expect(inserted.assignments).toBeUndefined();
    expect(inserted.outbox).toBeUndefined();
  });
});
