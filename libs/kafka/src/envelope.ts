import { randomUUID } from "node:crypto";
import type { EventEnvelope } from "@chowdeck/contracts";

export interface WrapOptions {
  /** Producing service name, e.g. "identity". */
  producer: string;
  /** Payload schema version. Defaults to 1. */
  version?: number;
  /** Correlation id to trace a logical flow across services. */
  correlationId?: string;
}

/**
 * Wrap a domain payload in the platform-standard {@link EventEnvelope}.
 * The generated `id` is what idempotent consumers dedupe on.
 */
export function wrapEvent<T>(
  type: string,
  payload: T,
  opts: WrapOptions,
): EventEnvelope<T> {
  return {
    id: randomUUID(),
    type,
    version: opts.version ?? 1,
    occurredAt: new Date().toISOString(),
    producer: opts.producer,
    correlationId: opts.correlationId,
    payload,
  };
}
