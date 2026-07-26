import { Module } from "@nestjs/common";
import { DispatchModule } from "../dispatch/dispatch.module";
import { TrackingGateway } from "./tracking.gateway";

/** Socket.IO realtime tracking. Depends on DispatchService for location + ownership. */
@Module({
  imports: [DispatchModule],
  providers: [TrackingGateway],
})
export class RealtimeModule {}
