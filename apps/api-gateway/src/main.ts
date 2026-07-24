import "reflect-metadata";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
// Load the repo-root .env regardless of where the process is started from.
loadEnv({ path: join(__dirname, "../../../.env") });

import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { validateEnv } from "@chowdeck/nest";
import { AppModule } from "./app.module";
import { GatewayMiddleware } from "./gateway/gateway.middleware";
import { envSchema, type Env } from "./config/env";

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

  // bodyParser:false — the gateway forwards raw request bodies to downstream services.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use(helmet());
  app.use(rateLimit({ windowMs: 60_000, limit: 120 })); // 120 req/min/IP
  app.enableCors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
    credentials: true,
  });

  // Mount the gateway (auth + routing + proxy) as a global middleware so the real
  // request path is preserved (Nest's forRoutes('*') rewrites req.path to '/').
  const gateway = app.get(GatewayMiddleware);
  app.use(gateway.use.bind(gateway));

  app.enableShutdownHooks();

  await app.listen(env.GATEWAY_PORT);
  Logger.log(
    `api-gateway listening on http://localhost:${env.GATEWAY_PORT}`,
    "Bootstrap",
  );
}

void bootstrap();
