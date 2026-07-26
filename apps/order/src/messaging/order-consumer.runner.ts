import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import {
  idempotent,
  type EventHandler,
  type MessageConsumer,
  type ProcessedEventStore,
} from "@chowdeck/kafka";
import {
  DispatchEventType,
  PaymentEventType,
  Topics,
  type EventEnvelope,
  type PaymentSucceeded,
  type RiderAssigned,
} from "@chowdeck/contracts";
import { OrdersService } from "../orders/orders.service";
import { MESSAGE_CONSUMER, PROCESSED_STORE } from "./tokens";

/**
 * Subscribes the order service to events that advance an order's status from the outside:
 *   - `payment.succeeded` (payment topic) → CREATED → PAID
 *   - `dispatch.rider_assigned` (dispatch topic) → READY → RIDER_ASSIGNED
 * The handler is wrapped with {@link idempotent} so at-least-once delivery can't double-apply.
 */
@Injectable()
export class OrderConsumerRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OrderConsumerRunner.name);
  private readonly handler: EventHandler;
  private readonly kafkaEnabled = process.env.KAFKA_ENABLED === "true";

  constructor(
    @Inject(MESSAGE_CONSUMER) private readonly consumer: MessageConsumer,
    @Inject(PROCESSED_STORE) private readonly processed: ProcessedEventStore,
    private readonly orders: OrdersService,
  ) {
    this.handler = idempotent(this.processed, (event) => this.handle(event));
  }

  private async handle(event: EventEnvelope): Promise<void> {
    switch (event.type) {
      case PaymentEventType.Succeeded: {
        const { orderId } = event.payload as PaymentSucceeded;
        const applied = await this.orders.applyPaymentSucceeded(orderId);
        this.log(orderId, "PAID", applied);
        break;
      }
      case DispatchEventType.RiderAssigned: {
        const { orderId, riderId } = event.payload as RiderAssigned;
        const applied = await this.orders.applyRiderAssigned(orderId, riderId);
        this.log(orderId, `RIDER_ASSIGNED (rider ${riderId})`, applied);
        break;
      }
      // ignore any other events on these topics
    }
  }

  private log(orderId: string, to: string, applied: boolean): void {
    if (applied) {
      this.logger.log(`order ${orderId} → ${to}`);
    } else {
      this.logger.warn(
        `transition to ${to} for order ${orderId} ignored (not found or illegal from current state)`,
      );
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.kafkaEnabled) {
      this.logger.warn(
        "KAFKA_ENABLED != true — order consumer idle (rider assignments won't be applied). " +
          "Run infra and set KAFKA_ENABLED=true to close the dispatch loop.",
      );
      return;
    }
    await this.consumer.connect();
    await this.consumer.subscribe(Topics.Payment, this.handler);
    await this.consumer.subscribe(Topics.Dispatch, this.handler);
    await this.consumer.run();
    this.logger.log(
      `consumer running — subscribed to "${Topics.Payment}" + "${Topics.Dispatch}"`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.kafkaEnabled) await this.consumer.disconnect();
  }
}
