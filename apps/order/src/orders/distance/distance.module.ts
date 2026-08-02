import { Module } from "@nestjs/common";
import { DISTANCE_PROVIDER, type DistanceProvider } from "./distance-provider";
import { HaversineDistanceProvider } from "./haversine-distance.provider";
import { OsrmDistanceProvider } from "./osrm-distance.provider";

/**
 * Provides the {@link DistanceProvider} by env: DISTANCE_PROVIDER=osrm for real road distance
 * via an OSRM server, otherwise the offline haversine approximation (default).
 */
@Module({
  providers: [
    {
      provide: DISTANCE_PROVIDER,
      useFactory: (): DistanceProvider =>
        process.env.DISTANCE_PROVIDER === "osrm"
          ? new OsrmDistanceProvider()
          : new HaversineDistanceProvider(),
    },
  ],
  exports: [DISTANCE_PROVIDER],
})
export class DistanceModule {}
