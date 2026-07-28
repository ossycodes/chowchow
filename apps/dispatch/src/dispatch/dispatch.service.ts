import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { and, eq, inArray } from "drizzle-orm";
import {
  DispatchEventType,
  Topics,
  type RiderAssigned,
} from "@chowdeck/contracts";
import { wrapEvent } from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import { assignments, outboxEvents, riders } from "../db/schema";
import { VENDOR_LOCATION_READER } from "../catalog/catalog.tokens";
import type { VendorLocationReader } from "../catalog/vendor-location-reader";
import { haversineKm, pickNearest } from "./geo";
import type { RegisterRiderRequest } from "./dto/register-rider.request";
import type { UpdateRiderRequest } from "./dto/update-rider.request";

/** Internal (in-process) app event: assignment committed → push to the WS room. */
export const RIDER_ASSIGNED_LOCAL = "rider.assigned.local";
export interface RiderAssignedLocal {
  orderId: string;
  riderId: string;
  assignmentId: string;
}

export const RiderStatus = {
  Online: "ONLINE",
  Offline: "OFFLINE",
  Busy: "BUSY",
} as const;

export const AssignmentStatus = {
  Pending: "PENDING",
  Assigned: "ASSIGNED",
  PickedUp: "PICKED_UP",
  Delivered: "DELIVERED",
} as const;

export type RiderRow = typeof riders.$inferSelect;
export type AssignmentRow = typeof assignments.$inferSelect;

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly events: EventEmitter2,
    @Inject(VENDOR_LOCATION_READER)
    private readonly vendorLocation: VendorLocationReader,
  ) {}

  // --- riders (ops/rider-app surface) ---

  async registerRider(input: RegisterRiderRequest): Promise<RiderRow> {
    const id = randomUUID();
    await this.dbService.db.insert(riders).values({
      id,
      name: input.name,
      status: input.status ?? RiderStatus.Online,
      lat: input.lat,
      lng: input.lng,
    });
    return this.getRiderOrThrow(id);
  }

  async listRiders(): Promise<RiderRow[]> {
    return this.dbService.db.select().from(riders);
  }

  async getRiderOrThrow(id: string): Promise<RiderRow> {
    const [row] = await this.dbService.db
      .select()
      .from(riders)
      .where(eq(riders.id, id))
      .limit(1);
    if (!row) throw new NotFoundException("rider not found");
    return row;
  }

  async updateRider(id: string, input: UpdateRiderRequest): Promise<RiderRow> {
    await this.getRiderOrThrow(id);
    await this.dbService.db.update(riders).set(input).where(eq(riders.id, id));
    return this.getRiderOrThrow(id);
  }

  // --- assignments ---

  async listAssignments(): Promise<AssignmentRow[]> {
    return this.dbService.db.select().from(assignments);
  }

  /**
   * Assign a rider to a ready order. Called from the `order.ready` consumer.
   *
   * Idempotent at the domain level: if this order already has an assignment we do nothing
   * (the unique orderId also guards against races). If no rider is ONLINE we still record a
   * PENDING assignment (so the order is visible to dispatch) but emit no event; a retry/geo
   * sweep will pick it up later.
   */
  async assignForOrder(
    orderId: string,
    vendorId: string,
    customerId: string,
  ): Promise<void> {
    const [existing] = await this.dbService.db
      .select()
      .from(assignments)
      .where(eq(assignments.orderId, orderId))
      .limit(1);
    if (existing) {
      this.logger.log(`order ${orderId} already has an assignment — skipping`);
      return;
    }

    const online = await this.dbService.db
      .select()
      .from(riders)
      .where(eq(riders.status, RiderStatus.Online));
    const rider = await this.chooseRider(online, vendorId);

    const assignmentId = randomUUID();

    if (!rider) {
      await this.dbService.db.insert(assignments).values({
        id: assignmentId,
        orderId,
        customerId,
        vendorId,
        riderId: null,
        status: AssignmentStatus.Pending,
      });
      this.logger.warn(
        `no ONLINE rider for order ${orderId} — assignment left PENDING`,
      );
      return;
    }

    const payload: RiderAssigned = { assignmentId, orderId, riderId: rider.id };
    const event = wrapEvent<RiderAssigned>(
      DispatchEventType.RiderAssigned,
      payload,
      { producer: "dispatch", correlationId: orderId },
    );

    await this.dbService.db.transaction(async (tx) => {
      await tx.insert(assignments).values({
        id: assignmentId,
        orderId,
        customerId,
        vendorId,
        riderId: rider.id,
        status: AssignmentStatus.Assigned,
      });
      await tx
        .update(riders)
        .set({ status: RiderStatus.Busy })
        .where(eq(riders.id, rider.id));
      await tx.insert(outboxEvents).values({
        id: event.id,
        topic: Topics.Dispatch,
        envelope: event,
        key: orderId,
      });
    });

    this.logger.log(`assigned rider ${rider.id} to order ${orderId}`);
    // Notify the WS layer in-process (decoupled from Kafka) so the customer's live map
    // updates immediately.
    this.events.emit(RIDER_ASSIGNED_LOCAL, {
      orderId,
      riderId: rider.id,
      assignmentId,
    } satisfies RiderAssignedLocal);
  }

  /**
   * Choose which ONLINE rider to assign. If we can get the vendor's pickup location AND some
   * online riders have reported a position, pick the **nearest** (haversine). Otherwise fall
   * back to the least-recently-updated rider (simple fairness) — e.g. a vendor without coords
   * or riders that haven't pinged a location yet.
   */
  private async chooseRider(
    online: RiderRow[],
    vendorId: string,
  ): Promise<RiderRow | undefined> {
    if (online.length === 0) return undefined;

    const vendorLoc = await this.vendorLocation
      .getVendorLocation(vendorId)
      .catch((err) => {
        this.logger.warn(
          `vendor location lookup failed for ${vendorId}: ${(err as Error).message}`,
        );
        return null;
      });

    if (vendorLoc) {
      const located = online
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => ({ id: r.id, lat: r.lat as number, lng: r.lng as number }));
      const nearest = pickNearest(vendorLoc, located);
      if (nearest) {
        this.logger.log(
          `nearest rider ${nearest.id} @ ${haversineKm(vendorLoc, nearest).toFixed(2)} km ` +
            `from vendor ${vendorId}`,
        );
        return online.find((r) => r.id === nearest.id);
      }
    }

    return [...online].sort(
      (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime(),
    )[0];
  }

  // --- realtime support ---

  /** The assignment for an order (for WS ownership checks), or null. */
  async getAssignmentForOrder(orderId: string): Promise<AssignmentRow | null> {
    const [row] = await this.dbService.db
      .select()
      .from(assignments)
      .where(eq(assignments.orderId, orderId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Record a rider's latest position and return the order ids they're actively delivering
   * (ASSIGNED/PICKED_UP) — the rooms whose customers should see this location.
   */
  async recordRiderLocation(
    riderId: string,
    lat: number,
    lng: number,
  ): Promise<string[]> {
    await this.dbService.db
      .update(riders)
      .set({ lat, lng })
      .where(eq(riders.id, riderId));

    const active = await this.dbService.db
      .select({ orderId: assignments.orderId })
      .from(assignments)
      .where(
        and(
          eq(assignments.riderId, riderId),
          inArray(assignments.status, [
            AssignmentStatus.Assigned,
            AssignmentStatus.PickedUp,
          ]),
        ),
      );
    return active.map((a) => a.orderId);
  }
}
