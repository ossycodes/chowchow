import "reflect-metadata";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
// Load the repo-root .env regardless of where the process is started from.
// __dirname is <root>/apps/identity/{src|dist}, so three levels up is the repo root.
loadEnv({ path: join(__dirname, "../../../.env") });

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
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
  app.enableShutdownHooks();

  await app.listen(env.IDENTITY_HTTP_PORT);
  Logger.log(
    `identity service listening on http://localhost:${env.IDENTITY_HTTP_PORT}`,
    "Bootstrap",
  );
}

void bootstrap();
