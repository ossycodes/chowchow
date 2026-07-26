import { Module } from "@nestjs/common";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { CATALOG_PACKAGE, CATALOG_PROTO_PATH } from "@chowdeck/contracts";
import { CatalogGrpcClient } from "./catalog.grpc-client";
import { CATALOG_GRPC_CLIENT, CATALOG_PRICE_READER } from "./catalog.tokens";

/**
 * Wires the gRPC client to the catalog service and exposes it behind the
 * {@link CatalogPriceReader} port. env is already loaded (main.ts) before this runs, so we
 * read CATALOG_GRPC_URL directly here.
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
          // int64 price_kobo → JS number (safe: well under 2^53).
          loader: { longs: Number },
        },
      },
    ]),
  ],
  providers: [{ provide: CATALOG_PRICE_READER, useClass: CatalogGrpcClient }],
  exports: [CATALOG_PRICE_READER],
})
export class CatalogClientModule {}
