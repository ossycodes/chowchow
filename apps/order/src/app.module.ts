import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { DbModule } from "./db/db.module";
import { MessagingModule } from "./messaging/messaging.module";
import { OrdersModule } from "./orders/orders.module";

@Module({
  imports: [DbModule, MessagingModule, OrdersModule],
  controllers: [HealthController],
})
export class AppModule {}
