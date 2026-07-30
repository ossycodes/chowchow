import {
  Controller,
  createParamDecorator,
  type ExecutionContext,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { PaymentsService } from "./payments.service";

/** Pulls the gateway-injected x-user-id (set after JWT verification), or 401. */
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

/** Read-only surface — charging is event-driven (order.created consumer), not a route. */
@Controller("payments")
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  async list(@CustomerId() customerId: string) {
    return { payments: await this.payments.listForCustomer(customerId) };
  }

  @Get("order/:orderId")
  async byOrder(
    @CustomerId() customerId: string,
    @Param("orderId") orderId: string,
  ) {
    const payment = await this.payments.getByOrder(orderId);
    if (!payment || payment.customerId !== customerId) {
      throw new NotFoundException("payment not found");
    }
    return { payment };
  }

  /**
   * Provider webhook (e.g. Paystack charge.success). PUBLIC — providers don't carry our JWT;
   * trust comes from the signature, verified in the service. Needs the RAW body for the HMAC,
   * so the app is created with `rawBody: true`.
   */
  @Post("webhook")
  @HttpCode(200)
  async webhook(
    @Headers("x-paystack-signature") signature: string | undefined,
    @Req() req: { rawBody?: Buffer },
  ) {
    await this.payments.handleWebhook(signature, req.rawBody ?? Buffer.alloc(0));
    return { received: true };
  }
}
