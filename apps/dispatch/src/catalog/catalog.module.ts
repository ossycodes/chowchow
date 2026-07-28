import { Module } from "@nestjs/common";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { CATALOG_PACKAGE, CATALOG_PROTO_PATH } from "@chowdeck/contracts";
import { CatalogGrpcClient } from "./catalog.grpc-client";
import { CATALOG_GRPC_CLIENT, VENDOR_LOCATION_READER } from "./catalog.tokens";

/**
 * Wires the gRPC client to catalog and exposes it behind the {@link VendorLocationReader}
 * port. env is loaded (main.ts) before this runs, so we read CATALOG_GRPC_URL directly.
 */
@Module({
  imports: [
    ClientsModule.register([
      {
        name: CATALOG_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: CATALOG_PACKAGE,
          protoPath: CATALOG_PROTO_PATH,
          url: process.env.CATALOG_GRPC_URL ?? "localhost:50051",
          loader: { longs: Number },
        },
      },
    ]),
  ],
  providers: [{ provide: VENDOR_LOCATION_READER, useClass: CatalogGrpcClient }],
  exports: [VENDOR_LOCATION_READER],
})
export class CatalogClientModule {}
