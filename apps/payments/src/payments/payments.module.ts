import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { FakePaymentProvider } from "./fake-payment-provider";
import { PaystackPaymentProvider } from "./paystack-payment-provider";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./payment-provider";

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    // Pick the adapter by env: PAYMENT_PROVIDER=paystack for the async webhook flow,
    // otherwise the instant "fake" provider for local dev.
    {
      provide: PAYMENT_PROVIDER,
      useFactory: (): PaymentProvider =>
        process.env.PAYMENT_PROVIDER === "paystack"
          ? new PaystackPaymentProvider()
          : new FakePaymentProvider(),
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
