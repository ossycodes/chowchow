import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import type { MessageProducer } from "@chowdeck/kafka";
import { MESSAGE_PRODUCER } from "../messaging/tokens";
import { UsersService, type RegisterInput } from "./users.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly users: UsersService,
    @Inject(MESSAGE_PRODUCER) private readonly producer: MessageProducer,
  ) {}

  @Post("register")
  async register(@Body() body: RegisterInput) {
    const user = await this.users.register(body);
    return { user };
  }

  /**
   * DEV-ONLY debug endpoint. When the in-memory producer is active it returns every
   * event the outbox relay has published, so you can watch the flow without Kafka.
   * With Kafka enabled, inspect the Redpanda console at http://localhost:8080 instead.
   */
  @Get("_published")
  published() {
    const maybeInMemory = this.producer as {
      published?: unknown[];
    };
    return {
      published:
        maybeInMemory.published ??
        "Kafka producer active — inspect the Redpanda console at http://localhost:8080",
    };
  }
}
