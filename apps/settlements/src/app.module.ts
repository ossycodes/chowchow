import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { DbModule } from "./db/db.module";
import { SettlementsModule } from "./settlements/settlements.module";
import { MessagingModule } from "./messaging/messaging.module";

@Module({
  imports: [DbModule, SettlementsModule, MessagingModule],
  controllers: [HealthController],
})
export class AppModule {}
