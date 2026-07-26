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
  SettlementEventType,
  Topics,
  type EventEnvelope,
  type PaymentSucceeded,
  type SettlementCompleted,
} from "@chowdeck/contracts";
import { LedgerService } from "../ledger/ledger.service";
import { MESSAGE_CONSUMER, PROCESSED_STORE } from "./tokens";

/**
 * Books double-entry journals from money events:
 *   - `payment.succeeded` (payment topic)     → DEBIT cash / CREDIT vendor_payable
 *   - `settlement.completed` (settlement topic) → DEBIT vendor_payable / CREDIT cash
 * Wrapped with {@link idempotent} (dedupe by event id) on top of the unique journal
 * reference — a replay can never double-book.
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
    switch (event.type) {
      case PaymentEventType.Succeeded:
        await this.ledger.recordPayment(event.payload as PaymentSucceeded);
        break;
      case SettlementEventType.Completed:
        await this.ledger.recordSettlement(event.payload as SettlementCompleted);
        break;
      // ignore payment.failed and any other events on these topics
    }
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
    await this.consumer.subscribe(Topics.Settlement, this.handler);
    await this.consumer.run();
    this.logger.log(
      `consumer running — subscribed to "${Topics.Payment}" + "${Topics.Settlement}"`,
    );
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.kafkaEnabled) await this.consumer.disconnect();
  }
}
