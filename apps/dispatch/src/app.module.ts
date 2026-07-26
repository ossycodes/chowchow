import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { HealthController } from "./health/health.controller";
import { DbModule } from "./db/db.module";
import { DispatchModule } from "./dispatch/dispatch.module";
import { MessagingModule } from "./messaging/messaging.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    DbModule,
    DispatchModule,
    MessagingModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
