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
  PaymentEventType,
  Topics,
  type EventEnvelope,
  type PaymentSucceeded,
} from "@chowdeck/contracts";
import { SettlementsService } from "../settlements/settlements.service";
import { MESSAGE_CONSUMER, PROCESSED_STORE } from "./tokens";

/**
 * Subscribes settlements to the `payment` topic and accrues an earning per
 * `payment.succeeded`. Idempotent by event id AND by the unique `earnings.paymentId`.
 */
@Injectable()
export class SettlementsConsumerRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SettlementsConsumerRunner.name);
  private readonly handler: EventHandler;
  private readonly kafkaEnabled = process.env.KAFKA_ENABLED === "true";

  constructor(
    @Inject(MESSAGE_CONSUMER) private readonly consumer: MessageConsumer,
    @Inject(PROCESSED_STORE) private readonly processed: ProcessedEventStore,
    private readonly settlements: SettlementsService,
  ) {
    this.handler = idempotent(this.processed, (event) => this.handle(event));
  }

  private async handle(event: EventEnvelope): Promise<void> {
    if (event.type !== PaymentEventType.Succeeded) return; // ignore payment.failed etc.
    await this.settlements.recordEarning(event.payload as PaymentSucceeded);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.kafkaEnabled) {
      this.logger.warn(
        "KAFKA_ENABLED != true — settlements consumer idle (no earnings accrued). " +
          "Run infra and set KAFKA_ENABLED=true to accrue on payment.succeeded.",
      );
      return;
    }
    await this.consumer.connect();
    await this.consumer.subscribe(Topics.Payment, this.handler);
    await this.consumer.run();
    this.logger.log(`consumer running — subscribed to topic "${Topics.Payment}"`);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.kafkaEnabled) await this.consumer.disconnect();
  }
}
