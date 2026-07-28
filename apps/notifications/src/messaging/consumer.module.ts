import { Global, Module } from "@nestjs/common";
import {
  InMemoryBus,
  processedEventStoreFromEnv,
  KafkaJsConsumer,
  type MessageConsumer,
  type ProcessedEventStore,
} from "@chowdeck/kafka";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationsController } from "../notifications/notifications.controller";
import { ConsumerRunner } from "./consumer.runner";
import { MESSAGE_CONSUMER, PROCESSED_STORE } from "./tokens";

/**
 * Chooses the consumer adapter by env. In-memory bus when Kafka is off (consumer sits
 * idle; use /_simulate). Production swap: KAFKA_ENABLED=true + a Redis/DB-backed
 * ProcessedEventStore so idempotency survives restarts.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    {
      provide: MESSAGE_CONSUMER,
      useFactory: (): MessageConsumer => {
        if (process.env.KAFKA_ENABLED === "true") {
          return new KafkaJsConsumer({
            clientId: `${process.env.KAFKA_CLIENT_ID ?? "chowdeck"}-notifications`,
            brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
            groupId: "notifications",
          });
        }
        return new InMemoryBus();
      },
    },
    {
      provide: PROCESSED_STORE,
      useFactory: (): ProcessedEventStore => processedEventStoreFromEnv(),
    },
    NotificationsService,
    ConsumerRunner,
  ],
  exports: [NotificationsService, ConsumerRunner],
})
export class ConsumerModule {}
