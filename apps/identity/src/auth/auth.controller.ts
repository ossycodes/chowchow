import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import type { MessageProducer } from "@chowdeck/kafka";
import { ZodValidationPipe } from "@chowdeck/nest";
import { MESSAGE_PRODUCER } from "../messaging/tokens";
import { UsersService } from "../users/users.service";
import {
  registerRequestSchema,
  type RegisterRequest,
} from "../users/dto/register.request";
import {
  loginRequestSchema,
  type LoginRequest,
} from "../users/dto/login.request";
import { AuthService } from "./auth.service";
import { refreshRequestSchema, type RefreshRequest } from "./refresh.request";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    @Inject(MESSAGE_PRODUCER) private readonly producer: MessageProducer,
  ) {}

  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
  ) {
    const user = await this.users.register(body);
    return { user };
  }

  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
  ) {
    return this.auth.login(body);
  }

  @Post("refresh")
  async refresh(
    @Body(new ZodValidationPipe(refreshRequestSchema)) body: RefreshRequest,
  ) {
    return this.auth.refresh(body.refreshToken);
  }

  /** DEV-ONLY: inspect events published by the in-memory producer (no-Kafka mode). */
  @Get("_published")
  published() {
    const maybeInMemory = this.producer as { published?: unknown[] };
    return {
      published:
        maybeInMemory.published ??
        "Kafka producer active — inspect the Redpanda console at http://localhost:8080",
    };
  }
}
