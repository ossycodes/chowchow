import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ZodValidationPipe } from "@chowdeck/nest";
import { DispatchService } from "./dispatch.service";
import {
  registerRiderRequestSchema,
  type RegisterRiderRequest,
} from "./dto/register-rider.request";
import {
  updateRiderRequestSchema,
  type UpdateRiderRequest,
} from "./dto/update-rider.request";

/**
 * Ops/rider-app surface. Assignment itself is event-driven (order.ready consumer), not a
 * route — these endpoints manage the rider fleet and inspect assignments. Routed under
 * `/dispatch` and authed at the gateway.
 */
@Controller("dispatch")
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Post("riders")
  async registerRider(
    @Body(new ZodValidationPipe(registerRiderRequestSchema))
    body: RegisterRiderRequest,
  ) {
    return { rider: await this.dispatch.registerRider(body) };
  }

  @Get("riders")
  async listRiders() {
    return { riders: await this.dispatch.listRiders() };
  }

  @Patch("riders/:id")
  async updateRider(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRiderRequestSchema))
    body: UpdateRiderRequest,
  ) {
    return { rider: await this.dispatch.updateRider(id, body) };
  }

  @Get("assignments")
  async listAssignments() {
    return { assignments: await this.dispatch.listAssignments() };
  }
}
