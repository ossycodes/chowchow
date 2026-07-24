import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { DbModule } from "./db/db.module";
import { MessagingModule } from "./messaging/messaging.module";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [DbModule, MessagingModule, UsersModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
