import { type AppConfig } from "@fbr/config";
import {
  DuffelFlightProvider,
  FastFlightsProvider,
  MockFlightProvider,
  ProviderRegistry,
  SerpApiFlightProvider,
  TravelpayoutsProvider,
  type FlightProvider,
} from "@fbr/flight-providers";
import { type Logger } from "@fbr/shared";

/**
 * Construit le registre de providers du worker. Composition par présence de
 * config (Phase 0 §5 — jamais de dépendance à un seul fournisseur) :
 * - `SERPAPI_API_KEY`      → `SerpApiFlightProvider` (payant, temps quasi réel).
 * - `TRAVELPAYOUTS_TOKEN`  → `TravelpayoutsProvider` (gratuit, données réelles **en cache**).
 * - `FAST_FLIGHTS_URL`     → `FastFlightsProvider` (sidecar gratuit best-effort).
 * - aucun                  → `MockFlightProvider` (scénario piloté par la config).
 *
 * Plusieurs providers configurés = exécution parallèle + dédup par le normalizer.
 */
export const buildProviderRegistry = (config: AppConfig, logger: Logger): ProviderRegistry => {
  const providers: FlightProvider[] = [];

  if (config.providers.serpapi) {
    providers.push(
      new SerpApiFlightProvider({
        apiKey: config.providers.serpapi.apiKey,
        timeoutMs: config.providers.serpapi.timeoutMs,
        maxDestinations: config.providers.serpapi.maxDestinations,
        logger,
      }),
    );
  }
  if (config.providers.travelpayouts) {
    providers.push(
      new TravelpayoutsProvider({
        token: config.providers.travelpayouts.token,
        ...(config.providers.travelpayouts.marker
          ? { marker: config.providers.travelpayouts.marker }
          : {}),
        timeoutMs: config.providers.travelpayouts.timeoutMs,
        maxDestinations: config.providers.travelpayouts.maxDestinations,
        logger,
      }),
    );
  }
  if (config.providers.fastFlights) {
    providers.push(
      new FastFlightsProvider({
        baseUrl: config.providers.fastFlights.url,
        timeoutMs: config.providers.fastFlights.timeoutMs,
      }),
    );
  }
  if (providers.length === 0) {
    providers.push(new MockFlightProvider({ name: "mock", scenario: config.engine.mockScenario }));
  }

  logger.info(
    { event: "providers_configured", providers: providers.map((p) => p.name) },
    "providers actifs",
  );
  return new ProviderRegistry(providers, { logger });
};

/**
 * Oracle de confirmation (Phase 0 §10) : si `DUFFEL_API_TOKEN` est défini, le
 * pipeline d'alerte valide les baisses exceptionnelles contre du contenu Duffel
 * réellement réservable au lieu de re-requêter le provider de recherche.
 * `null` sinon (confirmation via les providers de recherche, comportement Phase 5).
 */
export const buildConfirmationOracle = (
  config: AppConfig,
  logger: Logger,
): FlightProvider | null => {
  if (!config.providers.duffel) return null;
  logger.info({ event: "confirm_oracle_configured", oracle: "duffel" }, "oracle Duffel actif");
  return new DuffelFlightProvider({
    token: config.providers.duffel.token,
    timeoutMs: config.providers.duffel.timeoutMs,
    maxDestinations: config.providers.duffel.maxDestinations,
    logger,
  });
};
