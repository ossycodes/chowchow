import { Injectable, Logger } from "@nestjs/common";
import {
  IdentityEventType,
  userRegisteredSchema,
  type EventEnvelope,
} from "@chowdeck/contracts";

export interface SentNotification {
  to: string;
  channel: string;
  message: string;
  at: string;
  eventId: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** In-memory record of what we've "sent"; swap for a real store later. */
  private readonly sent: SentNotification[] = [];

  /**
   * Route an incoming event to the right reaction. Topics can carry multiple event
   * types, so we branch on `event.type` and ignore anything we don't care about.
   */
  async dispatch(event: EventEnvelope): Promise<void> {
    switch (event.type) {
      case IdentityEventType.UserRegistered:
        await this.sendWelcome(event);
        break;
      default:
        // not our concern — ignore
        break;
    }
  }

  private async sendWelcome(event: EventEnvelope): Promise<void> {
    const user = userRegisteredSchema.parse(event.payload);
    const message = `Welcome to Chowdeck, ${user.email}! 🎉 Your first delivery is on us.`;

    // TODO: real channel adapters — FCM/APNs push, Termii/Twilio SMS, email.
    this.sent.push({
      to: user.email,
      channel: "email",
      message,
      at: new Date().toISOString(),
      eventId: event.id,
    });
    this.logger.log(`welcome sent to ${user.email} (event ${event.id})`);
  }

  getSent(): SentNotification[] {
    return this.sent;
  }
}
