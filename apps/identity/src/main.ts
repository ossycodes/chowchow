import "reflect-metadata";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
// Load the repo-root .env regardless of where the process is started from.
// __dirname is <root>/apps/identity/{src|dist}, so three levels up is the repo root.
loadEnv({ path: join(__dirname, "../../../.env") });

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const port = Number(process.env.IDENTITY_HTTP_PORT ?? 3001);
  await app.listen(port);

  Logger.log(`identity service listening on http://localhost:${port}`, "Bootstrap");
}

void bootstrap();
