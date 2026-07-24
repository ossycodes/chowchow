import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { GatewayMiddleware } from "./gateway/gateway.middleware";

@Module({
  controllers: [HealthController],
  providers: [GatewayMiddleware],
})
export class AppModule {}
