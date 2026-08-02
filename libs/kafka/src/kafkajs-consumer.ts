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
      // Keep retrying transient connection/broker errors instead of giving up.
      retry: { retries: 10, initialRetryTime: 300, maxRetryTime: 30000 },
    });
    this.consumer = this.kafka.consumer({
      groupId: config.groupId,
      // Evict a dead/crashed member in ~10s instead of the 30s default — a lingering slot
      // keeps the whole group rebalancing, which stalls fetches (the "Fetch timed out"
      // crashes seen under heavy restart churn). Faster eviction = quicker, calmer recovery.
      sessionTimeout: 10000,
      heartbeatInterval: 3000,
      rebalanceTimeout: 30000,
      retry: {
        retries: 10,
        // A transient crash (e.g. a fetch that times out mid-rebalance) should self-heal,
        // not kill the process — always restart the consumer loop.
        restartOnFailure: async () => true,
      },
    });
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
