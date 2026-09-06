import { type AppConfig } from "@fbr/config";
import { MockFlightProvider, ProviderRegistry } from "@fbr/flight-providers";
import { type Logger } from "@fbr/shared";

/**
 * Construit le registre de providers utilisé par le worker.
 * Phase 3 : uniquement le `MockFlightProvider` (scénario piloté par la config).
 * Les providers réels (SerpApi, Duffel) sont ajoutés en Phase 7 sans toucher
 * au reste du pipeline.
 */
export const buildProviderRegistry = (config: AppConfig, logger: Logger): ProviderRegistry =>
  new ProviderRegistry(
    [new MockFlightProvider({ name: "mock", scenario: config.engine.mockScenario })],
    { logger },
  );
