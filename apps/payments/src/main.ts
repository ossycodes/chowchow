import "reflect-metadata";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
// Load the repo-root .env regardless of where the process is started from.
// __dirname is <root>/apps/payments/{src|dist}, so three levels up is the repo root.
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

  // rawBody: true keeps the exact request bytes (req.rawBody) so the webhook route can verify
  // the provider's HMAC signature over what was actually signed.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();

  await app.listen(env.PAYMENTS_HTTP_PORT);
  Logger.log(
    `payments service listening on http://localhost:${env.PAYMENTS_HTTP_PORT}`,
    "Bootstrap",
  );
}

void bootstrap();
