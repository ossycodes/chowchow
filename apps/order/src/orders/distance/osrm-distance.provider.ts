import { Injectable, Logger } from "@nestjs/common";
import type { GeoPoint } from "../delivery-fee";
import type { DistanceProvider, Route } from "./distance-provider";

interface OsrmResponse {
  code: string;
  routes?: { distance: number; duration: number }[];
}

/**
 * Real road-distance provider backed by an OSRM routing server (self-hosted, or the public
 * demo at router.project-osrm.org). Calls the `/route` API for driving distance + duration.
 *
 * On any error (network, non-200, no route) it returns null so checkout falls back to the flat
 * fee rather than failing — a maps outage must never block orders. Selected with
 * DISTANCE_PROVIDER=osrm + OSRM_URL. (Not exercised in the offline dev env; the haversine
 * provider is the tested default.)
 */
@Injectable()
export class OsrmDistanceProvider implements DistanceProvider {
  private readonly logger = new Logger(OsrmDistanceProvider.name);
  private readonly baseUrl =
    process.env.OSRM_URL ?? "https://router.project-osrm.org";
  private readonly timeoutMs = Number(process.env.OSRM_TIMEOUT_MS ?? 2000);

  async roadDistance(from: GeoPoint, to: GeoPoint): Promise<Route | null> {
    // OSRM expects lng,lat order.
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url = `${this.baseUrl}/route/v1/driving/${coords}?overview=false`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        this.logger.warn(`OSRM ${res.status} — falling back`);
        return null;
      }
      const body = (await res.json()) as OsrmResponse;
      const route = body.routes?.[0];
      if (body.code !== "Ok" || !route) return null;
      return { km: route.distance / 1000, etaMinutes: route.duration / 60 };
    } catch (err) {
      this.logger.warn(`OSRM lookup failed: ${(err as Error).message}`);
      return null;
    }
  }
}
