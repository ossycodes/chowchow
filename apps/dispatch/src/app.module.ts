import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { DbModule } from "./db/db.module";
import { DispatchModule } from "./dispatch/dispatch.module";
import { MessagingModule } from "./messaging/messaging.module";

@Module({
  imports: [DbModule, DispatchModule, MessagingModule],
  controllers: [HealthController],
})
export class AppModule {}
