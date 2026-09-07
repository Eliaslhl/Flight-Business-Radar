import { CDG_LONGHAUL_DESTINATIONS } from "@fbr/flight-domain";
import { type ApiInstance } from "../types.js";

/**
 * Liste seed des destinations long-courrier CDG (Phase 9 / décision §7). Données
 * de référence statiques — sert au dashboard pour libeller le mode Radar.
 */
export const registerRadarRoutes = (app: ApiInstance): void => {
  app.get("/api/radar/destinations", () => ({
    origin: "CDG",
    count: CDG_LONGHAUL_DESTINATIONS.length,
    destinations: CDG_LONGHAUL_DESTINATIONS,
  }));
};
