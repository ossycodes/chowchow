import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { SettlementsService } from "./settlements.service";

/**
 * Runs vendor + rider payouts automatically on a fixed interval (SETTLEMENT_INTERVAL_MS) when
 * SETTLEMENT_SCHEDULE_ENABLED=true — in production this would be a nightly cron. The manual
 * `/settlements/run` + `/settlements/riders/run` endpoints stay available as an ops override.
 * A single in-flight guard prevents overlapping runs. Same pattern as the outbox RelayRunner.
 */
@Injectable()
export class SettlementScheduler
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SettlementScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly enabled = process.env.SETTLEMENT_SCHEDULE_ENABLED === "true";
  private readonly intervalMs = Number(
    process.env.SETTLEMENT_INTERVAL_MS ?? 300000,
  );

  constructor(private readonly settlements: SettlementsService) {}

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log(
        "automatic payouts disabled (set SETTLEMENT_SCHEDULE_ENABLED=true to enable); " +
          "use POST /settlements/run and /settlements/riders/run manually",
      );
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.logger.log(`automatic payouts every ${this.intervalMs}ms`);
  }

  /** Run both payouts once. Public so the tick and tests can drive it. */
  async runPayouts(): Promise<{ vendors: number; riders: number }> {
    const [vendors, riders] = await Promise.all([
      this.settlements.runAll(),
      this.settlements.runRiderSettlements(),
    ]);
    return { vendors: vendors.length, riders: riders.length };
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { vendors, riders } = await this.runPayouts();
      if (vendors > 0 || riders > 0) {
        this.logger.log(
          `scheduled payout: ${vendors} vendor(s), ${riders} rider(s)`,
        );
      }
    } catch (err) {
      this.logger.error(`scheduled payout failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
