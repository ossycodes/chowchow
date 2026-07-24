import { Controller, Get } from "@nestjs/common";
import { Topics } from "@chowdeck/contracts";

@Controller("health")
export class HealthController {
  /** Liveness probe. */
  @Get()
  check() {
    return {
      service: "catalog",
      status: "ok",
      ts: new Date().toISOString(),
    };
  }

  /** Proves the shared @chowdeck/contracts package is wired into this service. */
  @Get("topics")
  topics() {
    return { topics: Object.values(Topics) };
  }
}
