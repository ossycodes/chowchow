import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const port = Number(process.env.NOTIFICATIONS_HTTP_PORT ?? 3002);
  await app.listen(port);

  Logger.log(
    `notifications service listening on http://localhost:${port}`,
    "Bootstrap",
  );
}

void bootstrap();
