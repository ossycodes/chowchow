import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { DbModule } from "./db/db.module";
import { CatalogModule } from "./catalog/catalog.module";

@Module({
  imports: [DbModule, CatalogModule],
  controllers: [HealthController],
})
export class AppModule {}
