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
import { LedgerService } from "../ledger/ledger.service";
import { MESSAGE_CONSUMER, PROCESSED_STORE } from "./tokens";

/**
 * Subscribes the ledger to the `payment` topic and books a double-entry journal on
 * `payment.succeeded`. Wrapped with {@link idempotent} (dedupe by event id) on top of the
 * unique journal reference — a replay can never double-book.
 */
@Injectable()
export class LedgerConsumerRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(LedgerConsumerRunner.name);
  private readonly handler: EventHandler;
  private readonly kafkaEnabled = process.env.KAFKA_ENABLED === "true";

  constructor(
    @Inject(MESSAGE_CONSUMER) private readonly consumer: MessageConsumer,
    @Inject(PROCESSED_STORE) private readonly processed: ProcessedEventStore,
    private readonly ledger: LedgerService,
  ) {
    this.handler = idempotent(this.processed, (event) => this.handle(event));
  }

  private async handle(event: EventEnvelope): Promise<void> {
    if (event.type !== PaymentEventType.Succeeded) return; // ignore payment.failed etc.
    await this.ledger.recordPayment(event.payload as PaymentSucceeded);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.kafkaEnabled) {
      this.logger.warn(
        "KAFKA_ENABLED != true — ledger consumer idle (payments won't be booked). " +
          "Run infra and set KAFKA_ENABLED=true to record double-entry journals.",
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
