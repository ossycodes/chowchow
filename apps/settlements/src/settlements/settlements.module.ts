import { Module } from "@nestjs/common";
import { SettlementsController } from "./settlements.controller";
import { SettlementsService } from "./settlements.service";
import { SettlementScheduler } from "./settlement-scheduler";

@Module({
  controllers: [SettlementsController],
  providers: [SettlementsService, SettlementScheduler],
  exports: [SettlementsService],
})
export class SettlementsModule {}
