import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { OutboxRelay, type MessageProducer } from "@chowdeck/kafka";
import { MESSAGE_PRODUCER } from "./tokens";

/**
 * Connects the producer on boot and drains the outbox on a fixed interval.
 * A single in-flight guard prevents overlapping drains.
 */
@Injectable()
export class RelayRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RelayRunner.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  private static readonly INTERVAL_MS = 1000;

  constructor(
    @Inject(MESSAGE_PRODUCER) private readonly producer: MessageProducer,
    private readonly relay: OutboxRelay,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.producer.connect();
    this.timer = setInterval(() => void this.tick(), RelayRunner.INTERVAL_MS);
    this.logger.log(`outbox relay started (every ${RelayRunner.INTERVAL_MS}ms)`);
  }

  private async tick(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const n = await this.relay.drain();
      if (n > 0) this.logger.log(`relay published ${n} event(s)`);
    } catch (err) {
      this.logger.error(`relay drain failed: ${(err as Error).message}`);
    } finally {
      this.draining = false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.producer.disconnect();
  }
}
