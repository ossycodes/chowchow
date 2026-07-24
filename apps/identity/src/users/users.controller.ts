import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Returns the currently authenticated user. Trusts the `x-user-id` header, which is set
   * by the API gateway AFTER it verifies the JWT. In production only the gateway can reach
   * this service, so the header is trustworthy. A direct call without it → 401.
   */
  @Get("me")
  async me(@Headers("x-user-id") userId?: string) {
    if (!userId) {
      throw new UnauthorizedException("missing authenticated user context");
    }
    const user = await this.users.get(userId);
    if (!user) throw new NotFoundException("user not found");
    return { user };
  }
}
