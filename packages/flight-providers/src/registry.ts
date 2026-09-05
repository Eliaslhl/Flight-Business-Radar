import { type FlightOffer, type FlightSearchRequest } from "@fbr/flight-domain";
import { LogEvent, toAppError, type Logger } from "@fbr/shared";
import { type FlightProvider } from "./provider.js";

export interface ProviderOutcome {
  readonly provider: string;
  readonly ok: boolean;
  readonly offerCount: number;
  readonly latencyMs: number;
  readonly error?: { code: string; message: string; retryable: boolean };
}

export interface AggregatedSearch {
  /** Offres concaténées de tous les providers en succès (non dédupliquées). */
  readonly offers: FlightOffer[];
  readonly outcomes: ProviderOutcome[];
}

export interface ProviderRegistryOptions {
  readonly logger?: Logger;
}

/**
 * Exécute plusieurs providers en parallèle (Phase 0 §25). Un échec provider
 * n'interrompt jamais les autres : chaque résultat est isolé via
 * `Promise.allSettled` et reporté dans `outcomes`.
 */
export class ProviderRegistry {
  private readonly providers: readonly FlightProvider[];
  private readonly logger: Logger | undefined;

  constructor(providers: readonly FlightProvider[], options: ProviderRegistryOptions = {}) {
    this.providers = providers;
    this.logger = options.logger;
  }

  get names(): string[] {
    return this.providers.map((p) => p.name);
  }

  async searchAll(request: FlightSearchRequest): Promise<AggregatedSearch> {
    const settled = await Promise.all(
      this.providers.map((provider) => this.runOne(provider, request)),
    );

    const offers = settled.flatMap((r) => r.offers);
    const outcomes = settled.map((r) => r.outcome);
    return { offers, outcomes };
  }

  private async runOne(
    provider: FlightProvider,
    request: FlightSearchRequest,
  ): Promise<{ offers: FlightOffer[]; outcome: ProviderOutcome }> {
    const startedAt = performance.now();
    this.logger?.debug(
      { event: LogEvent.ProviderRequest, provider: provider.name },
      "provider request",
    );

    try {
      const offers = await provider.searchFlights(request);
      const latencyMs = Math.round(performance.now() - startedAt);
      this.logger?.info(
        {
          event: LogEvent.ProviderResponse,
          provider: provider.name,
          offerCount: offers.length,
          latencyMs,
        },
        "provider response",
      );
      return {
        offers,
        outcome: { provider: provider.name, ok: true, offerCount: offers.length, latencyMs },
      };
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startedAt);
      const appError = toAppError(error);
      this.logger?.warn(
        {
          event: LogEvent.ProviderError,
          provider: provider.name,
          latencyMs,
          ...appError.toLogObject(),
        },
        "provider error",
      );
      return {
        offers: [],
        outcome: {
          provider: provider.name,
          ok: false,
          offerCount: 0,
          latencyMs,
          error: {
            code: appError.code,
            message: appError.message,
            retryable: appError.retryable,
          },
        },
      };
    }
  }
}
