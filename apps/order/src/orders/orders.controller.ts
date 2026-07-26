import {
  Body,
  Controller,
  createParamDecorator,
  type ExecutionContext,
  Get,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { ZodValidationPipe } from "@chowdeck/nest";
import { OrdersService } from "./orders.service";
import {
  createOrderRequestSchema,
  type CreateOrderRequest,
} from "./dto/create-order.request";
import {
  transitionOrderRequestSchema,
  type TransitionOrderRequest,
} from "./dto/transition-order.request";

/**
 * Param decorator: pulls the gateway-injected `x-user-id` (set AFTER the gateway verifies
 * the JWT), or 401 if absent. The service never trusts a client-supplied identity.
 */
const CustomerId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const userId = req.headers["x-user-id"];
    if (typeof userId !== "string" || userId.length === 0) {
      throw new UnauthorizedException("missing authenticated user context");
    }
    return userId;
  },
);

/** All routes are protected at the gateway; the customer is the authenticated user. */
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async checkout(
    @CustomerId() customerId: string,
    @Body(new ZodValidationPipe(createOrderRequestSchema))
    body: CreateOrderRequest,
  ) {
    return this.orders.checkout(customerId, body);
  }

  @Get()
  async list(@CustomerId() customerId: string) {
    return { orders: await this.orders.listForCustomer(customerId) };
  }

  @Get(":id")
  async get(@CustomerId() customerId: string, @Param("id") id: string) {
    return this.orders.getForCustomer(customerId, id);
  }

  @Post(":id/transition")
  async transition(
    @CustomerId() customerId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(transitionOrderRequestSchema))
    body: TransitionOrderRequest,
  ) {
    return this.orders.transition(customerId, id, body.status);
  }
}
