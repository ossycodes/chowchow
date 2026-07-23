import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { ConsumerModule } from "./messaging/consumer.module";

@Module({
  imports: [ConsumerModule],
  controllers: [HealthController],
})
export class AppModule {}
