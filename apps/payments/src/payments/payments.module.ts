import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { FakePaymentProvider } from "./fake-payment-provider";
import { PAYMENT_PROVIDER } from "./payment-provider";

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    // Only the "fake" adapter exists today; when real providers arrive, pick by
    // env (PAYMENT_PROVIDER) with a useFactory here.
    { provide: PAYMENT_PROVIDER, useClass: FakePaymentProvider },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
