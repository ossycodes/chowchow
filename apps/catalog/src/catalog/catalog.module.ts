import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogGrpcController } from "./catalog.grpc.controller";
import { CatalogService } from "./catalog.service";

@Module({
  controllers: [CatalogController, CatalogGrpcController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
