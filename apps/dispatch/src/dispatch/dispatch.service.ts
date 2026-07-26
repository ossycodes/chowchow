import { randomUUID } from "node:crypto";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import {
  DispatchEventType,
  Topics,
  type RiderAssigned,
} from "@chowdeck/contracts";
import { wrapEvent } from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import { assignments, outboxEvents, riders } from "../db/schema";
import type { RegisterRiderRequest } from "./dto/register-rider.request";
import type { UpdateRiderRequest } from "./dto/update-rider.request";

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

  constructor(private readonly dbService: DbService) {}

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
  async assignForOrder(orderId: string, vendorId: string): Promise<void> {
    const [existing] = await this.dbService.db
      .select()
      .from(assignments)
      .where(eq(assignments.orderId, orderId))
      .limit(1);
    if (existing) {
      this.logger.log(`order ${orderId} already has an assignment — skipping`);
      return;
    }

    // Pick the least-recently-updated ONLINE rider (simple fairness). Geo-based
    // nearest-rider matching arrives with live locations in the realtime slice.
    const [rider] = await this.dbService.db
      .select()
      .from(riders)
      .where(eq(riders.status, RiderStatus.Online))
      .orderBy(asc(riders.updatedAt))
      .limit(1);

    const assignmentId = randomUUID();

    if (!rider) {
      await this.dbService.db.insert(assignments).values({
        id: assignmentId,
        orderId,
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
  }
}
