import { Injectable } from "@nestjs/common";
import { haversineKm, type GeoPoint } from "../delivery-fee";
import type { DistanceProvider, Route } from "./distance-provider";

/**
 * Offline distance provider — no maps API needed. Approximates a real route by scaling the
 * straight-line distance by a road factor (roads aren't straight), and estimates ETA from an
 * average speed. Good enough as the default; swap in {@link OsrmDistanceProvider} for true
 * road distance.
 */
@Injectable()
export class HaversineDistanceProvider implements DistanceProvider {
  private readonly roadFactor = Number(process.env.ROAD_FACTOR ?? 1.3);
  private readonly avgSpeedKmh = Number(process.env.AVG_SPEED_KMH ?? 25);

  async roadDistance(from: GeoPoint, to: GeoPoint): Promise<Route> {
    const km = haversineKm(from, to) * this.roadFactor;
    const etaMinutes = (km / this.avgSpeedKmh) * 60;
    return { km, etaMinutes };
  }
}
