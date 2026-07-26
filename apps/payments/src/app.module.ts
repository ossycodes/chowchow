import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { DbModule } from "./db/db.module";
import { PaymentsModule } from "./payments/payments.module";
import { MessagingModule } from "./messaging/messaging.module";

@Module({
  imports: [DbModule, PaymentsModule, MessagingModule],
  controllers: [HealthController],
})
export class AppModule {}
