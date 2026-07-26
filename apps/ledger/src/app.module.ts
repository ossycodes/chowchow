import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { DbModule } from "./db/db.module";
import { LedgerModule } from "./ledger/ledger.module";
import { ConsumerModule } from "./messaging/consumer.module";

@Module({
  imports: [DbModule, LedgerModule, ConsumerModule],
  controllers: [HealthController],
})
export class AppModule {}
