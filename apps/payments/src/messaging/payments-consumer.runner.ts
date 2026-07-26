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
  type OrderCreated,
} from "@chowdeck/contracts";
import { PaymentsService } from "../payments/payments.service";
import { MESSAGE_CONSUMER, PROCESSED_STORE } from "./tokens";

/**
 * Subscribes payments to the `order` topic and charges on `order.created`. Wrapped with
 * {@link idempotent} (dedupe by event id) on top of the DB's unique orderId — belt and
 * braces against double-charging.
 */
@Injectable()
export class PaymentsConsumerRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(PaymentsConsumerRunner.name);
  private readonly handler: EventHandler;
  private readonly kafkaEnabled = process.env.KAFKA_ENABLED === "true";

  constructor(
    @Inject(MESSAGE_CONSUMER) private readonly consumer: MessageConsumer,
    @Inject(PROCESSED_STORE) private readonly processed: ProcessedEventStore,
    private readonly payments: PaymentsService,
  ) {
    this.handler = idempotent(this.processed, (event) => this.handle(event));
  }

  private async handle(event: EventEnvelope): Promise<void> {
    if (event.type !== OrderEventType.Created) return; // ignore other order events
    await this.payments.handleOrderCreated(event.payload as OrderCreated);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.kafkaEnabled) {
      this.logger.warn(
        "KAFKA_ENABLED != true — payments consumer idle (orders won't be charged). " +
          "Run infra and set KAFKA_ENABLED=true to charge on order.created.",
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
