import { CDG_LONGHAUL_DESTINATIONS, countryCodeOf, WORLD_AIRPORTS } from "@fbr/flight-domain";
import { type ApiInstance } from "../types.js";

/**
 * Données de référence **statiques** (aucun secret, aucune DB) :
 * - `/api/radar/destinations` : liste seed long-courrier CDG (mode Radar).
 * - `/api/airports` : référentiel d'aéroports pour l'autocomplétion des
 *   champs origine / destination du dashboard.
 *
 * Chaque entrée porte `countryCode` (ISO 3166-1 alpha-2, `""` si inconnu) pour
 * l'affichage d'un drapeau côté front.
 */
export const registerRadarRoutes = (app: ApiInstance): void => {
  const withCode = <T extends { country: string }>(a: T): T & { countryCode: string } => ({
    ...a,
    countryCode: countryCodeOf(a.country),
  });

  app.get("/api/radar/destinations", () => ({
    origin: "CDG",
    count: CDG_LONGHAUL_DESTINATIONS.length,
    destinations: CDG_LONGHAUL_DESTINATIONS.map(withCode),
  }));

  app.get("/api/airports", () => ({
    count: WORLD_AIRPORTS.length,
    airports: WORLD_AIRPORTS.map(withCode),
  }));
};
