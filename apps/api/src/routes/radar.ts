import { CDG_LONGHAUL_DESTINATIONS, WORLD_AIRPORTS } from "@fbr/flight-domain";
import { type ApiInstance } from "../types.js";

/**
 * Données de référence **statiques** (aucun secret, aucune DB) :
 * - `/api/radar/destinations` : liste seed long-courrier CDG (mode Radar).
 * - `/api/airports` : référentiel d'aéroports pour l'autocomplétion des
 *   champs origine / destination du dashboard.
 */
export const registerRadarRoutes = (app: ApiInstance): void => {
  app.get("/api/radar/destinations", () => ({
    origin: "CDG",
    count: CDG_LONGHAUL_DESTINATIONS.length,
    destinations: CDG_LONGHAUL_DESTINATIONS,
  }));

  app.get("/api/airports", () => ({
    count: WORLD_AIRPORTS.length,
    airports: WORLD_AIRPORTS,
  }));
};
