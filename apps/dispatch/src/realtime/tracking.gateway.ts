import { Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { z } from "zod";
import {
  DispatchService,
  RIDER_ASSIGNED_LOCAL,
  type RiderAssignedLocal,
} from "../dispatch/dispatch.service";

const locationSchema = z.object({
  riderId: z.string().uuid(),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});
const subscribeSchema = z.object({ orderId: z.string().uuid() });

function roomFor(orderId: string): string {
  return `order:${orderId}`;
}

/**
 * Realtime tracking over Socket.IO. Two roles share this gateway:
 *  - riders emit `rider:location` → we store it and fan it out to the order's room.
 *  - customers `order:subscribe` to their order → they receive `tracking:location` and
 *    `tracking:assigned` for it (ownership-checked).
 *
 * Auth: the JWT access token is passed on the handshake (`auth.token`) and verified here,
 * so the socket carries the same identity as the REST APIs. Traffic still enters through the
 * gateway (which proxies the WS upgrade) — dispatch is never exposed directly.
 */
@WebSocketGateway({ cors: { origin: true } })
export class TrackingGateway implements OnGatewayConnection {
  private readonly logger = new Logger(TrackingGateway.name);
  private readonly accessSecret = process.env.JWT_ACCESS_SECRET as string;

  @WebSocketServer()
  private server!: Server;

  constructor(private readonly dispatch: DispatchService) {}

  /** Verify the JWT on connect; attach the user id, or reject the socket. */
  handleConnection(client: Socket): void {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      this.bearerFromHeader(client);
    if (!token) return this.reject(client, "missing token");
    try {
      const payload = jwt.verify(token, this.accessSecret) as JwtPayload;
      if (payload.typ !== "access") return this.reject(client, "wrong token type");
      client.data.userId = String(payload.sub);
      client.data.actorType = payload.actorType;
    } catch {
      return this.reject(client, "invalid token");
    }
  }

  /** A rider streams its position. Fan out to every order this rider is delivering. */
  @SubscribeMessage("rider:location")
  async onRiderLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const parsed = locationSchema.safeParse(body);
    if (!parsed.success) {
      client.emit("tracking:error", { message: "invalid location payload" });
      return;
    }
    const { riderId, lat, lng } = parsed.data;
    const orderIds = await this.dispatch.recordRiderLocation(riderId, lat, lng);
    for (const orderId of orderIds) {
      this.server
        .to(roomFor(orderId))
        .emit("tracking:location", { orderId, riderId, lat, lng });
    }
  }

  /** A customer subscribes to their order's live tracking (must own the order). */
  @SubscribeMessage("order:subscribe")
  async onOrderSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      client.emit("tracking:error", { message: "invalid subscribe payload" });
      return;
    }
    const { orderId } = parsed.data;
    const assignment = await this.dispatch.getAssignmentForOrder(orderId);
    if (!assignment || assignment.customerId !== client.data.userId) {
      client.emit("tracking:error", { message: "not your order" });
      return;
    }
    await client.join(roomFor(orderId));
    client.emit("tracking:subscribed", {
      orderId,
      riderId: assignment.riderId,
      status: assignment.status,
    });
  }

  /** Assignment just committed (in-process event) → tell the order's room. */
  @OnEvent(RIDER_ASSIGNED_LOCAL)
  onRiderAssigned(payload: RiderAssignedLocal): void {
    this.server
      .to(roomFor(payload.orderId))
      .emit("tracking:assigned", payload);
  }

  private bearerFromHeader(client: Socket): string | undefined {
    const header = client.handshake.headers.authorization;
    return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  }

  private reject(client: Socket, reason: string): void {
    this.logger.warn(`rejecting socket ${client.id}: ${reason}`);
    client.emit("tracking:error", { message: `unauthorized: ${reason}` });
    client.disconnect(true);
  }
}
