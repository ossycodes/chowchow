import { Global, Module } from "@nestjs/common";
import {
  InMemoryProducer,
  KafkaJsProducer,
  OutboxRelay,
  type MessageProducer,
  type OutboxStore,
} from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import { MESSAGE_PRODUCER, OUTBOX_STORE } from "./tokens";
import { DrizzleOutboxStore } from "./drizzle-outbox.store";
import { RelayRunner } from "./relay.runner";

/**
 * Wires the messaging ports. The outbox store is MySQL-backed (durable across restarts).
 * The producer is chosen by env: real Kafka when KAFKA_ENABLED=true, otherwise an in-memory
 * recorder for local dev.
 */
@Global()
@Module({
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
    RelayRunner,
  ],
  exports: [MESSAGE_PRODUCER, OUTBOX_STORE, OutboxRelay],
})
export class MessagingModule {}
