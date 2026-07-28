import { Module } from "@nestjs/common";
import { CatalogClientModule } from "../catalog/catalog.module";
import { DispatchController } from "./dispatch.controller";
import { DispatchService } from "./dispatch.service";

@Module({
  imports: [CatalogClientModule],
  controllers: [DispatchController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
