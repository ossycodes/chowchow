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
  OrderEventType,
  Topics,
  type EventEnvelope,
  type OrderReady,
} from "@chowdeck/contracts";
import { DispatchService } from "../dispatch/dispatch.service";
import { MESSAGE_CONSUMER, PROCESSED_STORE } from "./tokens";

/**
 * Subscribes dispatch to the `order` topic and reacts to `order.ready` by assigning a rider.
 * Wrapped with {@link idempotent} so a redelivered event doesn't double-assign. This is the
 * entry point of the async dispatch loop.
 */
@Injectable()
export class DispatchConsumerRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DispatchConsumerRunner.name);
  private readonly handler: EventHandler;
  private readonly kafkaEnabled = process.env.KAFKA_ENABLED === "true";

  constructor(
    @Inject(MESSAGE_CONSUMER) private readonly consumer: MessageConsumer,
    @Inject(PROCESSED_STORE) private readonly processed: ProcessedEventStore,
    private readonly dispatch: DispatchService,
  ) {
    this.handler = idempotent(this.processed, (event) => this.handle(event));
  }

  private async handle(event: EventEnvelope): Promise<void> {
    if (event.type !== OrderEventType.Ready) return; // ignore other order events
    const ready = event.payload as OrderReady;
    await this.dispatch.assignForOrder(
      ready.orderId,
      ready.vendorId,
      ready.customerId,
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.kafkaEnabled) {
      this.logger.warn(
        "KAFKA_ENABLED != true — dispatch consumer idle (no rider assignment). " +
          "Run infra and set KAFKA_ENABLED=true to drive dispatch from order.ready events.",
      );
      return;
    }
    await this.consumer.connect();
    await this.consumer.subscribe(Topics.Order, this.handler);
    await this.consumer.run();
    this.logger.log(`consumer running — subscribed to topic "${Topics.Order}"`);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.kafkaEnabled) await this.consumer.disconnect();
  }
}
