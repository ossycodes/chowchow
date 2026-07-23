import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { DbModule } from "./db/db.module";
import { MessagingModule } from "./messaging/messaging.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [DbModule, MessagingModule, UsersModule],
  controllers: [HealthController],
})
export class AppModule {}
