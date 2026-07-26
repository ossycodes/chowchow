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
  Topics,
  type EventEnvelope,
  type RiderAssigned,
} from "@chowdeck/contracts";
import { OrdersService } from "../orders/orders.service";
import { MESSAGE_CONSUMER, PROCESSED_STORE } from "./tokens";

/**
 * Subscribes the order service to the `dispatch` topic and advances orders when a rider is
 * assigned. The handler is wrapped with {@link idempotent} so at-least-once delivery can't
 * double-apply. This is the consumer half of the async dispatch loop:
 *   order.ready → dispatch → dispatch.rider_assigned → (here) order → RIDER_ASSIGNED
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
    if (event.type !== DispatchEventType.RiderAssigned) return; // ignore other dispatch events
    const { orderId, riderId } = event.payload as RiderAssigned;
    const applied = await this.orders.applyRiderAssigned(orderId, riderId);
    if (applied) {
      this.logger.log(`order ${orderId} → RIDER_ASSIGNED (rider ${riderId})`);
    } else {
      this.logger.warn(
        `rider_assigned for order ${orderId} ignored (not found or illegal from current state)`,
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
    await this.consumer.subscribe(Topics.Dispatch, this.handler);
    await this.consumer.run();
    this.logger.log(`consumer running — subscribed to topic "${Topics.Dispatch}"`);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.kafkaEnabled) await this.consumer.disconnect();
  }
}
