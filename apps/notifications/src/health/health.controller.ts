import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      service: "notifications",
      status: "ok",
      kafka: process.env.KAFKA_ENABLED === "true" ? "enabled" : "idle",
      ts: new Date().toISOString(),
    };
  }
}
