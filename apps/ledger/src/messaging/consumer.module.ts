import { Global, Module } from "@nestjs/common";
import {
  InMemoryBus,
  processedEventStoreFromEnv,
  KafkaJsConsumer,
  type MessageConsumer,
  type ProcessedEventStore,
} from "@chowdeck/kafka";
import { LedgerModule } from "../ledger/ledger.module";
import { LedgerConsumerRunner } from "./ledger-consumer.runner";
import { MESSAGE_CONSUMER, PROCESSED_STORE } from "./tokens";

/**
 * Consumer-only messaging for the ledger (it's a terminal read-model — no events out).
 * Adapter chosen by env: real Kafka when KAFKA_ENABLED=true, else an idle in-memory bus.
 */
@Global()
@Module({
  imports: [LedgerModule],
  providers: [
    {
      provide: MESSAGE_CONSUMER,
      useFactory: (): MessageConsumer => {
        if (process.env.KAFKA_ENABLED === "true") {
          return new KafkaJsConsumer({
            clientId: `${process.env.KAFKA_CLIENT_ID ?? "chowdeck"}-ledger`,
            brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
            groupId: "ledger",
          });
        }
        return new InMemoryBus();
      },
    },
    {
      provide: PROCESSED_STORE,
      useFactory: (): ProcessedEventStore => processedEventStoreFromEnv("ledger"),
    },
    LedgerConsumerRunner,
  ],
})
export class ConsumerModule {}
