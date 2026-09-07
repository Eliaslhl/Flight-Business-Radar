import { type AppConfig } from "@fbr/config";
import {
  FastFlightsProvider,
  MockFlightProvider,
  ProviderRegistry,
  SerpApiFlightProvider,
  type FlightProvider,
} from "@fbr/flight-providers";
import { type Logger } from "@fbr/shared";

/**
 * Construit le registre de providers du worker. Composition par présence de
 * config (Phase 0 §5 — jamais de dépendance à un seul fournisseur) :
 * - `SERPAPI_API_KEY`   → `SerpApiFlightProvider` (payant, Google Flights).
 * - `FAST_FLIGHTS_URL`  → `FastFlightsProvider` (sidecar gratuit best-effort).
 * - aucun des deux      → `MockFlightProvider` (scénario piloté par la config).
 *
 * Si SerpApi **et** fast-flights sont configurés, les deux tournent en parallèle
 * et le normalizer déduplique par empreinte.
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
