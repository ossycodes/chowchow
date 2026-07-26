import { Module } from "@nestjs/common";
import { CatalogClientModule } from "../catalog/catalog.module";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [CatalogClientModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
