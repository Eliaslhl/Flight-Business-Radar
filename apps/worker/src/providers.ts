import { type AppConfig } from "@fbr/config";
import { FastFlightsProvider, MockFlightProvider, ProviderRegistry } from "@fbr/flight-providers";
import { type Logger } from "@fbr/shared";

/**
 * Construit le registre de providers du worker.
 * - `FAST_FLIGHTS_URL` défini → `FastFlightsProvider` (sidecar `services/flight-scraper`).
 * - sinon → `MockFlightProvider` (scénario piloté par la config).
 *
 * Ajouter d'autres providers réels (SerpApi, Duffel) = les pousser ici, sans
 * toucher au pipeline en aval.
 */
export const buildProviderRegistry = (config: AppConfig, logger: Logger): ProviderRegistry => {
  if (config.providers.fastFlights) {
    logger.info(
      {
        event: "providers_configured",
        provider: "fast-flights",
        url: config.providers.fastFlights.url,
      },
      "provider fast-flights actif",
    );
    return new ProviderRegistry(
      [
        new FastFlightsProvider({
          baseUrl: config.providers.fastFlights.url,
          timeoutMs: config.providers.fastFlights.timeoutMs,
        }),
      ],
      { logger },
    );
  }

  return new ProviderRegistry(
    [new MockFlightProvider({ name: "mock", scenario: config.engine.mockScenario })],
    { logger },
  );
};
