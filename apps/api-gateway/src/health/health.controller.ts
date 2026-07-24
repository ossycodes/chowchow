import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { service: "api-gateway", status: "ok", ts: new Date().toISOString() };
  }
}
