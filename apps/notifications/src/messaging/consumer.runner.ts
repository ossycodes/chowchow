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
import { Topics, type EventEnvelope } from "@chowdeck/contracts";
import { NotificationsService } from "../notifications/notifications.service";
import { MESSAGE_CONSUMER, PROCESSED_STORE } from "./tokens";

/**
 * Subscribes the notifications service to the `identity` topic. The handler is wrapped
 * with {@link idempotent} so at-least-once delivery never sends two welcome messages.
 */
@Injectable()
export class ConsumerRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ConsumerRunner.name);
  private readonly handler: EventHandler;
  private kafkaEnabled = process.env.KAFKA_ENABLED === "true";

  constructor(
    @Inject(MESSAGE_CONSUMER) private readonly consumer: MessageConsumer,
    @Inject(PROCESSED_STORE) private readonly processed: ProcessedEventStore,
    private readonly notifications: NotificationsService,
  ) {
    // Same idempotent handler used by both the live consumer and /_simulate.
    this.handler = idempotent(this.processed, (event) =>
      this.notifications.dispatch(event),
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.kafkaEnabled) {
      this.logger.warn(
        "KAFKA_ENABLED != true — consumer idle. Run `pnpm infra:up` and set " +
          "KAFKA_ENABLED=true to receive live events, or POST /notifications/_simulate " +
          "to exercise the handler locally.",
      );
      return;
    }
    await this.consumer.connect();
    await this.consumer.subscribe(Topics.Identity, this.handler);
    await this.consumer.run();
    this.logger.log(`consumer running — subscribed to topic "${Topics.Identity}"`);
  }

  /** DEV: push an event through the real idempotent handler (used by /_simulate). */
  async simulate(event: EventEnvelope): Promise<void> {
    await this.handler(event);
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.kafkaEnabled) await this.consumer.disconnect();
  }
}
