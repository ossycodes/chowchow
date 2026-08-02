import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import {
  OrderEventType,
  OrderStatus,
  Topics,
  type CatalogItemMessage,
  type OrderCreated,
  type OrderDelivered,
  type OrderReady,
} from "@chowdeck/contracts";
import { wrapEvent } from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import { orderItems, orders, outboxEvents } from "../db/schema";
import { CATALOG_PRICE_READER } from "../catalog/catalog.tokens";
import type { CatalogPriceReader } from "../catalog/catalog-price-reader";
import { canTransition } from "./order-status";
import { feeFromKm, type DeliveryFeeConfig } from "./delivery-fee";
import {
  DISTANCE_PROVIDER,
  type DistanceProvider,
} from "./distance/distance-provider";
import type { CreateOrderRequest } from "./dto/create-order.request";

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export interface OrderWithItems {
  order: OrderRow;
  items: OrderItemRow[];
}

@Injectable()
export class OrdersService {
  private readonly feeConfig: DeliveryFeeConfig = {
    baseKobo: Number(process.env.DELIVERY_FEE_BASE_KOBO ?? 30000),
    perKmKobo: Number(process.env.DELIVERY_FEE_PER_KM_KOBO ?? 5000),
    flatKobo: Number(process.env.DELIVERY_FEE_KOBO ?? 50000),
  };

  constructor(
    private readonly dbService: DbService,
    @Inject(CATALOG_PRICE_READER)
    private readonly catalog: CatalogPriceReader,
    @Inject(DISTANCE_PROVIDER)
    private readonly distance: DistanceProvider,
  ) {}

  /**
   * Checkout. The client sends item ids + quantities; we fetch REAL prices from catalog over
   * gRPC, validate the cart, snapshot prices onto the order, compute the total (kobo), and
   * persist the order + its lines + an `order.created` outbox event in ONE transaction.
   */
  async checkout(
    customerId: string,
    input: CreateOrderRequest,
  ): Promise<OrderWithItems> {
    const ids = input.items.map((i) => i.itemId);
    const priced = await this.catalog.getItems(ids);
    const byId = new Map<string, CatalogItemMessage>(
      priced.map((p) => [p.id, p]),
    );

    const orderId = randomUUID();
    const lines = input.items.map((line) => {
      const item = byId.get(line.itemId);
      if (!item) {
        throw new BadRequestException(`item ${line.itemId} not found`);
      }
      if (item.vendorId !== input.vendorId) {
        throw new BadRequestException(
          `item ${line.itemId} does not belong to vendor ${input.vendorId}`,
        );
      }
      if (!item.isAvailable) {
        throw new ConflictException(`item ${line.itemId} is unavailable`);
      }
      return {
        id: randomUUID(),
        orderId,
        itemId: item.id,
        name: item.name,
        unitPriceKobo: item.priceKobo,
        quantity: line.quantity,
        lineTotalKobo: item.priceKobo * line.quantity,
      };
    });

    const subtotalKobo = lines.reduce((sum, l) => sum + l.lineTotalKobo, 0);

    // Distance-based delivery fee + ETA: route the vendor pickup (from catalog) → customer
    // drop-off (from the request) via the distance provider. Falls back to a flat fee (and no
    // ETA) when a location is missing or the provider can't route.
    const customerLoc =
      input.deliveryLat != null && input.deliveryLng != null
        ? { lat: input.deliveryLat, lng: input.deliveryLng }
        : null;
    const vendorLoc = await this.catalog.getVendorLocation(input.vendorId);
    const route =
      vendorLoc && customerLoc
        ? await this.distance.roadDistance(vendorLoc, customerLoc)
        : null;
    const deliveryFeeKobo = route
      ? feeFromKm(route.km, this.feeConfig)
      : this.feeConfig.flatKobo;
    const etaMinutes = route ? Math.round(route.etaMinutes) : null;
    const totalKobo = subtotalKobo + deliveryFeeKobo;

    const payload: OrderCreated = {
      orderId,
      customerId,
      vendorId: input.vendorId,
      subtotalKobo,
      deliveryFeeKobo,
      totalKobo,
      status: OrderStatus.Created,
    };
    const event = wrapEvent<OrderCreated>(OrderEventType.Created, payload, {
      producer: "order",
      correlationId: orderId,
    });

    await this.dbService.db.transaction(async (tx) => {
      await tx.insert(orders).values({
        id: orderId,
        customerId,
        vendorId: input.vendorId,
        status: OrderStatus.Created,
        deliveryLat: customerLoc?.lat,
        deliveryLng: customerLoc?.lng,
        deliveryFeeKobo,
        etaMinutes,
        totalKobo,
      });
      await tx.insert(orderItems).values(lines);
      await tx.insert(outboxEvents).values({
        id: event.id,
        topic: Topics.Order,
        envelope: event,
        key: orderId,
      });
    });

    return this.getForCustomer(customerId, orderId);
  }

  /** List a customer's orders (newest first), without line items. */
  async listForCustomer(customerId: string): Promise<OrderRow[]> {
    return this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customerId));
  }

  /** Fetch one of the customer's orders with its line items, or 404. */
  async getForCustomer(
    customerId: string,
    orderId: string,
  ): Promise<OrderWithItems> {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)))
      .limit(1);
    if (!order) throw new NotFoundException("order not found");

    const items = await this.dbService.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));

    return { order, items };
  }

  /**
   * Advance an order to a new status, enforcing the state machine. A valid status that is an
   * illegal jump from the current one → 409 Conflict (not a 400 — the input was well-formed).
   */
  async transition(
    customerId: string,
    orderId: string,
    to: OrderStatus,
  ): Promise<OrderWithItems> {
    const { order } = await this.getForCustomer(customerId, orderId);
    const from = order.status as OrderStatus;
    if (from === to) {
      throw new ConflictException(`order is already ${to}`);
    }
    if (!canTransition(from, to)) {
      throw new ConflictException(`illegal transition ${from} → ${to}`);
    }
    await this.applyStatus(order, to);
    return this.getForCustomer(customerId, orderId);
  }

  /**
   * Persist a status change and, for statuses other services react to, write the matching
   * outbox event in the SAME transaction:
   *   - READY     → order.ready     (dispatch assigns a rider)
   *   - DELIVERED → order.delivered (settlements accrues the rider's delivery-fee earning)
   */
  private async applyStatus(order: OrderRow, to: OrderStatus): Promise<void> {
    await this.dbService.db.transaction(async (tx) => {
      await tx.update(orders).set({ status: to }).where(eq(orders.id, order.id));

      if (to === OrderStatus.Ready) {
        const event = wrapEvent<OrderReady>(
          OrderEventType.Ready,
          {
            orderId: order.id,
            customerId: order.customerId,
            vendorId: order.vendorId,
            status: OrderStatus.Ready,
          },
          { producer: "order", correlationId: order.id },
        );
        await tx.insert(outboxEvents).values({
          id: event.id,
          topic: Topics.Order,
          envelope: event,
          key: order.id,
        });
      } else if (to === OrderStatus.Delivered && order.riderId) {
        // The rider earned their delivery fee — only on completed delivery.
        const event = wrapEvent<OrderDelivered>(
          OrderEventType.Delivered,
          {
            orderId: order.id,
            customerId: order.customerId,
            vendorId: order.vendorId,
            riderId: order.riderId,
            deliveryFeeKobo: order.deliveryFeeKobo,
            status: OrderStatus.Delivered,
          },
          { producer: "order", correlationId: order.id },
        );
        await tx.insert(outboxEvents).values({
          id: event.id,
          topic: Topics.Order,
          envelope: event,
          key: order.id,
        });
      }
    });
  }

  /**
   * System-driven CREATED → PAID, applied when payments confirms a charge (consumer of
   * payment.succeeded). No customer scoping; idempotent; illegal moves ignored.
   */
  async applyPaymentSucceeded(orderId: string): Promise<boolean> {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) return false;
    const from = order.status as OrderStatus;
    if (from === OrderStatus.Paid) return true; // already applied
    if (!canTransition(from, OrderStatus.Paid)) return false;
    await this.dbService.db
      .update(orders)
      .set({ status: OrderStatus.Paid })
      .where(eq(orders.id, orderId));
    return true;
  }

  /**
   * System-driven transition used by the dispatch.rider_assigned consumer (no customer
   * scoping — this is the platform acting, not a user). Idempotent: if the order is already
   * past READY, it's a no-op. Illegal moves are ignored (logged by the caller).
   */
  async applyRiderAssigned(orderId: string, riderId: string): Promise<boolean> {
    const [order] = await this.dbService.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) return false;
    const from = order.status as OrderStatus;
    if (from === OrderStatus.RiderAssigned) return true; // already applied
    if (!canTransition(from, OrderStatus.RiderAssigned)) return false;
    // Remember which rider is delivering — needed to pay them on order.delivered.
    await this.dbService.db
      .update(orders)
      .set({ status: OrderStatus.RiderAssigned, riderId })
      .where(eq(orders.id, orderId));
    return true;
  }
}
