import "reflect-metadata";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
// Load the repo-root .env regardless of where the process is started from.
// __dirname is <root>/apps/catalog/{src|dist}, so three levels up is the repo root.
loadEnv({ path: join(__dirname, "../../../.env") });

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Transport, type MicroserviceOptions } from "@nestjs/microservices";
import { CATALOG_PACKAGE, CATALOG_PROTO_PATH } from "@chowdeck/contracts";
import { validateEnv } from "@chowdeck/nest";
import { AppModule } from "./app.module";
import { envSchema, type Env } from "./config/env";

/** Validate config at boot; on failure print a readable message and exit. */
function loadEnvConfig(): Env {
  try {
    return validateEnv(envSchema);
  } catch (err) {
    Logger.error((err as Error).message, "Config");
    process.exit(1);
  }
}

async function bootstrap() {
  const env = loadEnvConfig();

  const app = await NestFactory.create(AppModule);

  // Attach a gRPC microservice to the SAME process (hybrid app): REST for external clients
  // via the gateway, gRPC for internal service-to-service calls (e.g. order → catalog).
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.GRPC,
      options: {
        package: CATALOG_PACKAGE,
        protoPath: CATALOG_PROTO_PATH,
        url: env.CATALOG_GRPC_URL,
        // int64 (price_kobo) → JS number instead of the default string/Long. Safe: our
        // kobo values are far below 2^53.
        loader: { longs: Number },
      },
    },
    { inheritAppConfig: true },
  );

  app.enableShutdownHooks();

  await app.startAllMicroservices();
  await app.listen(env.CATALOG_HTTP_PORT);
  Logger.log(
    `catalog service listening on http://localhost:${env.CATALOG_HTTP_PORT} ` +
      `(gRPC on ${env.CATALOG_GRPC_URL})`,
    "Bootstrap",
  );
}

void bootstrap();
