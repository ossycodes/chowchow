import { z } from "zod";

/**
 * Every domain event published to Kafka is wrapped in this envelope.
 * The envelope is stable across the whole platform; only `payload` varies by event type.
 */
export const eventEnvelopeSchema = z.object({
  /** Unique id for this event instance (used for idempotent consumers). */
  id: z.string().uuid(),
  /** Dotted event type, e.g. "order.created". */
  type: z.string().min(1),
  /** Schema version of the payload for this event type. */
  version: z.number().int().positive(),
  /** ISO-8601 timestamp of when the event occurred. */
  occurredAt: z.string().datetime(),
  /** Name of the service that produced the event, e.g. "identity". */
  producer: z.string().min(1),
  /** Correlation id to trace a single logical flow (e.g. one order) across services. */
  correlationId: z.string().optional(),
  /** The event-specific payload. Validated by the concrete event schema. */
  payload: z.unknown(),
});

export type EventEnvelope<T = unknown> = Omit<
  z.infer<typeof eventEnvelopeSchema>,
  "payload"
> & { payload: T };
