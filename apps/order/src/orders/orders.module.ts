import { Module } from "@nestjs/common";
import {
  InMemoryBus,
  InMemoryProcessedEventStore,
  KafkaJsConsumer,
  type MessageConsumer,
  type ProcessedEventStore,
} from "@chowdeck/kafka";
import { CatalogClientModule } from "../catalog/catalog.module";
import {
  MESSAGE_CONSUMER,
  PROCESSED_STORE,
} from "../messaging/tokens";
import { OrderConsumerRunner } from "../messaging/order-consumer.runner";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [CatalogClientModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    {
      provide: MESSAGE_CONSUMER,
      useFactory: (): MessageConsumer => {
        if (process.env.KAFKA_ENABLED === "true") {
          return new KafkaJsConsumer({
            clientId: `${process.env.KAFKA_CLIENT_ID ?? "chowdeck"}-order`,
            brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
            groupId: "order",
          });
        }
        return new InMemoryBus();
      },
    },
    {
      provide: PROCESSED_STORE,
      useFactory: (): ProcessedEventStore => new InMemoryProcessedEventStore(),
    },
    OrderConsumerRunner,
  ],
})
export class OrdersModule {}
