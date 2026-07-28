import Redis from "ioredis";
import {
  InMemoryProcessedEventStore,
  type ProcessedEventStore,
} from "./idempotency";

export interface RedisProcessedEventStoreOptions {
  /** How long a processed id is remembered (seconds). Default 7 days. */
  ttlSeconds?: number;
  /** Key prefix in Redis. Default "processed:". */
  keyPrefix?: string;
}

/**
 * Redis-backed {@link ProcessedEventStore}. Unlike the in-memory store, dedupe state
 * SURVIVES restarts and is SHARED across instances of a service — so at-least-once delivery
 * can't cause reprocessing after a redeploy or across a scaled-out consumer group.
 *
 * `markIfNew` uses a single atomic `SET key 1 NX EX ttl`: it sets the key only if absent and
 * returns whether we won the race. Ids expire after `ttl` (the practical dedupe window) so
 * Redis doesn't grow forever.
 */
export class RedisProcessedEventStore implements ProcessedEventStore {
  private readonly ttlSeconds: number;
  private readonly keyPrefix: string;

  /** Accepts a redis:// URL or an existing ioredis client (e.g. for tests). */
  constructor(
    private readonly redis: Redis,
    opts: RedisProcessedEventStoreOptions = {},
  ) {
    this.ttlSeconds = opts.ttlSeconds ?? 7 * 24 * 60 * 60;
    this.keyPrefix = opts.keyPrefix ?? "processed:";
  }

  static fromUrl(
    url: string,
    opts: RedisProcessedEventStoreOptions = {},
  ): RedisProcessedEventStore {
    return new RedisProcessedEventStore(new Redis(url), opts);
  }

  private key(eventId: string): string {
    return `${this.keyPrefix}${eventId}`;
  }

  async markIfNew(eventId: string): Promise<boolean> {
    const res = await this.redis.set(
      this.key(eventId),
      "1",
      "EX",
      this.ttlSeconds,
      "NX",
    );
    return res === "OK"; // "OK" = we set it (new); null = already present
  }

  async unmark(eventId: string): Promise<void> {
    await this.redis.del(this.key(eventId));
  }

  /** Close the underlying connection (called on app shutdown). */
  async close(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Duck-typed NestJS shutdown hook (matched by name, no framework import) — Nest calls this
   * on a factory-provided instance so the Redis connection closes cleanly on shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}

/**
 * Pick the {@link ProcessedEventStore} from the environment: Redis when `REDIS_URL` is set
 * (durable, shared across instances), otherwise the in-memory store (local dev/tests).
 *
 * `namespace` MUST be unique per consumer (use the Kafka consumer group id). The dedupe keys
 * are `processed:<namespace>:<eventId>`, so an event consumed by SEVERAL services (e.g.
 * `payment.succeeded` → order, ledger, settlements) is deduped per-consumer, not globally —
 * otherwise whichever service handled it first would make the others skip it.
 */
export function processedEventStoreFromEnv(
  namespace: string,
): ProcessedEventStore {
  const url = process.env.REDIS_URL;
  return url
    ? RedisProcessedEventStore.fromUrl(url, {
        keyPrefix: `processed:${namespace}:`,
      })
    : new InMemoryProcessedEventStore();
}
