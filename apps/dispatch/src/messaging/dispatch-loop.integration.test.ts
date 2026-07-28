import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { eq } from "drizzle-orm";
import {
  DispatchEventType,
  Topics,
  type EventEnvelope,
  type RiderAssigned,
} from "@chowdeck/contracts";
import {
  KafkaJsConsumer,
  KafkaJsProducer,
  OutboxRelay,
} from "@chowdeck/kafka";
import { DbService } from "../db/db.service";
import { assignments, outboxEvents, riders } from "../db/schema";
import { DispatchService, RiderStatus } from "../dispatch/dispatch.service";
import { DrizzleOutboxStore } from "./drizzle-outbox.store";

/**
 * Integration test for the dispatch produce-side loop against REAL infra (MySQL + Redpanda).
 * Skipped unless RUN_INTEGRATION=1, so the normal `pnpm test` stays infra-free.
 *
 *   assignForOrder (real MySQL tx) → outbox row → relay → Kafka → consumer sees rider_assigned
 *
 * Robust to a running dispatch service: whichever relay drains the row publishes it, and our
 * unique-group consumer reads it regardless.
 */
describe.skipIf(!process.env.RUN_INTEGRATION)(
  "dispatch loop (integration)",
  () => {
    const brokers = () =>
      (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",");
    let db: DbService;
    let producer: KafkaJsProducer;
    let consumer: KafkaJsConsumer;
    const received: EventEnvelope[] = [];
    const riderId = randomUUID();

    beforeAll(async () => {
      loadEnv({ path: join(__dirname, "../../../../.env") });
      process.env.KAFKA_ENABLED = "true";

      db = new DbService();
      await db.onModuleInit();
      await db.db
        .insert(riders)
        .values({ id: riderId, name: "IntegRider", status: RiderStatus.Online });

      producer = new KafkaJsProducer({
        clientId: "integ-producer",
        brokers: brokers(),
      });
      await producer.connect();

      consumer = new KafkaJsConsumer({
        clientId: "integ-consumer",
        brokers: brokers(),
        groupId: `integ-${randomUUID()}`,
      });
      await consumer.connect();
      await consumer.subscribe(Topics.Dispatch, async (e) => {
        received.push(e);
      });
      await consumer.run();
    }, 30_000);

    afterAll(async () => {
      await consumer?.disconnect();
      await producer?.disconnect();
      await db?.db.delete(riders).where(eq(riders.id, riderId));
      await db?.onModuleDestroy();
    });

    it("assigns a rider and delivers rider_assigned end to end over Kafka", async () => {
      const orderId = randomUUID();
      const vendorId = randomUUID();
      const customerId = randomUUID();

      const svc = new DispatchService(db, new EventEmitter2(), {
        getVendorLocation: async () => null, // fallback selection; geo not under test here
      });
      await svc.assignForOrder(orderId, vendorId, customerId);

      // real DB: an assignment row was written with a rider
      const [assignment] = await db.db
        .select()
        .from(assignments)
        .where(eq(assignments.orderId, orderId))
        .limit(1);
      expect(assignment).toBeDefined();
      expect(assignment.status).toBe("ASSIGNED");
      expect(assignment.riderId).toBeTruthy();

      // publish whatever is still pending in the outbox (a running relay may beat us — fine)
      const relay = new OutboxRelay(new DrizzleOutboxStore(db), producer, {
        batchSize: 100,
      });
      await relay.drain();

      // the event lands on the dispatch topic and our consumer sees it
      const found = await waitFor(
        () =>
          received.find(
            (e) =>
              e.type === DispatchEventType.RiderAssigned &&
              (e.payload as RiderAssigned).orderId === orderId,
          ),
        20_000,
      );
      expect(found).toBeDefined();
      expect((found!.payload as RiderAssigned).riderId).toBe(
        assignment.riderId,
      );

      // cleanup this order's rows
      await db.db.delete(assignments).where(eq(assignments.orderId, orderId));
      await db.db
        .delete(outboxEvents)
        .where(eq(outboxEvents.key, orderId));
    }, 30_000);
  },
);

async function waitFor<T>(
  fn: () => T | undefined,
  timeoutMs: number,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
  return undefined;
}
