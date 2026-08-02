import { Kafka, type Producer, logLevel } from "kafkajs";
import type { EventEnvelope } from "@chowdeck/contracts";
import type { MessageProducer } from "./producer";

export interface KafkaJsProducerConfig {
  clientId: string;
  brokers: string[];
}

/**
 * Production {@link MessageProducer} backed by kafkajs. Idempotent producer so retries
 * don't create duplicate broker-side records; consumers still dedupe on `event.id`
 * because the outbox relay guarantees at-least-once, not exactly-once.
 */
export class KafkaJsProducer implements MessageProducer {
  private readonly kafka: Kafka;
  private readonly producer: Producer;

  constructor(config: KafkaJsProducerConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      logLevel: logLevel.WARN,
      retry: { retries: 10, initialRetryTime: 300, maxRetryTime: 30000 },
    });
    this.producer = this.kafka.producer({ idempotent: true });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(topic: string, event: EventEnvelope, key?: string): Promise<void> {
    await this.producer.send({
      topic,
      messages: [
        {
          key: key ?? event.id,
          value: JSON.stringify(event),
          headers: {
            "event-type": event.type,
            "event-version": String(event.version),
            producer: event.producer,
            ...(event.correlationId
              ? { "correlation-id": event.correlationId }
              : {}),
          },
        },
      ],
    });
  }
}
