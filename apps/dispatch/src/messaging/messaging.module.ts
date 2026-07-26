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
import { DispatchModule } from "../dispatch/dispatch.module";
import {
  MESSAGE_CONSUMER,
  MESSAGE_PRODUCER,
  OUTBOX_STORE,
  PROCESSED_STORE,
} from "./tokens";
import { DrizzleOutboxStore } from "./drizzle-outbox.store";
import { RelayRunner } from "./relay.runner";
import { DispatchConsumerRunner } from "./dispatch-consumer.runner";

/**
 * Wires both sides of messaging for dispatch:
 *  - PRODUCE: MySQL outbox + relay publishes `dispatch.rider_assigned`.
 *  - CONSUME: subscribes to the `order` topic and reacts to `order.ready`.
 * Adapters are chosen by env (real Kafka when KAFKA_ENABLED=true, else in-memory).
 */
@Global()
@Module({
  imports: [DispatchModule],
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
            clientId: `${process.env.KAFKA_CLIENT_ID ?? "chowdeck"}-dispatch`,
            brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
            groupId: "dispatch",
          });
        }
        return new InMemoryBus();
      },
    },
    {
      provide: PROCESSED_STORE,
      useFactory: (): ProcessedEventStore => processedEventStoreFromEnv(),
    },
    RelayRunner,
    DispatchConsumerRunner,
  ],
  exports: [MESSAGE_PRODUCER, OUTBOX_STORE, OutboxRelay],
})
export class MessagingModule {}
