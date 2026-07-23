import { Kafka, type Consumer, logLevel } from "kafkajs";
import type { EventEnvelope } from "@chowdeck/contracts";
import type { EventHandler, MessageConsumer } from "./consumer";

export interface KafkaJsConsumerConfig {
  clientId: string;
  brokers: string[];
  /** Consumer group id — all instances sharing it split the partitions. */
  groupId: string;
}

/** Production {@link MessageConsumer} backed by kafkajs. */
export class KafkaJsConsumer implements MessageConsumer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly handlers = new Map<string, EventHandler>();

  constructor(config: KafkaJsConsumerConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      logLevel: logLevel.WARN,
    });
    this.consumer = this.kafka.consumer({ groupId: config.groupId });
  }

  async connect(): Promise<void> {
    await this.consumer.connect();
  }

  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }

  async subscribe(topic: string, handler: EventHandler): Promise<void> {
    this.handlers.set(topic, handler);
    await this.consumer.subscribe({ topic, fromBeginning: true });
  }

  async run(): Promise<void> {
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const handler = this.handlers.get(topic);
        if (!handler || !message.value) return;
        const event = JSON.parse(message.value.toString()) as EventEnvelope;
        await handler(event);
      },
    });
  }
}
