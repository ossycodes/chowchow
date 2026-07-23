import { randomUUID } from "node:crypto";
import { Body, Controller, Get, Post } from "@nestjs/common";
import { ActorType, IdentityEventType } from "@chowdeck/contracts";
import { wrapEvent } from "@chowdeck/kafka";
import { NotificationsService } from "./notifications.service";
import { ConsumerRunner } from "../messaging/consumer.runner";

@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly runner: ConsumerRunner,
  ) {}

  /** What we've "sent" so far. */
  @Get("_sent")
  sent() {
    return { sent: this.notifications.getSent() };
  }

  /**
   * DEV-ONLY: fabricate a `user.registered` event and push it through the SAME
   * idempotent handler the live consumer uses. Lets you see the loop work without Kafka.
   * Send the same `userId` twice to watch idempotency skip the duplicate.
   */
  @Post("_simulate")
  async simulate(
    @Body() body: { email?: string; userId?: string; eventId?: string },
  ) {
    const event = wrapEvent(
      IdentityEventType.UserRegistered,
      {
        // payload userId must be a UUID (per the shared schema)
        userId: body.userId ?? randomUUID(),
        actorType: ActorType.Customer,
        email: body.email ?? "demo@example.com",
      },
      { producer: "identity" },
    );
    // Allow forcing the envelope id to demonstrate idempotent dedupe over HTTP.
    if (body.eventId) event.id = body.eventId;

    await this.runner.simulate(event);
    return {
      eventId: event.id,
      sentCount: this.notifications.getSent().length,
    };
  }
}
