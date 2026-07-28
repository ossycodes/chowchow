import { Global, Module } from "@nestjs/common";
import {
  InMemoryBus,
  processedEventStoreFromEnv,
  InMemoryProducer,
  KafkaJsConsumer,
  KafkaJsProducer,
  OutboxRelay,
  type MessageConsumer,
  type MessageProducer,
  type OutboxStore,
  type ProcessedEventStore,
} from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import { PaymentsModule } from "../payments/payments.module";
import {
  MESSAGE_CONSUMER,
  MESSAGE_PRODUCER,
  OUTBOX_STORE,
  PROCESSED_STORE,
} from "./tokens";
import { DrizzleOutboxStore } from "./drizzle-outbox.store";
import { RelayRunner } from "./relay.runner";
import { PaymentsConsumerRunner } from "./payments-consumer.runner";

/**
 * Wires both sides of messaging for payments:
 *  - CONSUME: subscribes to the `order` topic and charges on `order.created`.
 *  - PRODUCE: MySQL outbox + relay publishes `payment.succeeded` / `payment.failed`.
 * Adapters chosen by env (real Kafka when KAFKA_ENABLED=true, else in-memory).
 */
@Global()
@Module({
  imports: [PaymentsModule],
  providers: [
    {
      provide: MESSAGE_PRODUCER,
      useFactory: (): MessageProducer => {
        if (process.env.KAFKA_ENABLED === "true") {
          return new KafkaJsProducer({
            clientId: process.env.KAFKA_CLIENT_ID ?? "chowdeck",
            brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
          });
        }
        return new InMemoryProducer();
      },
    },
    {
      provide: OUTBOX_STORE,
      useFactory: (dbService: DbService): OutboxStore =>
        new DrizzleOutboxStore(dbService),
      inject: [DbService],
    },
    {
      provide: OutboxRelay,
      useFactory: (producer: MessageProducer, store: OutboxStore) =>
        new OutboxRelay(store, producer, { batchSize: 100 }),
      inject: [MESSAGE_PRODUCER, OUTBOX_STORE],
    },
    {
      provide: MESSAGE_CONSUMER,
      useFactory: (): MessageConsumer => {
        if (process.env.KAFKA_ENABLED === "true") {
          return new KafkaJsConsumer({
            clientId: `${process.env.KAFKA_CLIENT_ID ?? "chowdeck"}-payments`,
            brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
            groupId: "payments",
          });
        }
        return new InMemoryBus();
      },
    },
    {
      provide: PROCESSED_STORE,
      useFactory: (): ProcessedEventStore => processedEventStoreFromEnv("payments"),
    },
    RelayRunner,
    PaymentsConsumerRunner,
  ],
  exports: [MESSAGE_PRODUCER, OUTBOX_STORE, OutboxRelay],
})
export class MessagingModule {}
