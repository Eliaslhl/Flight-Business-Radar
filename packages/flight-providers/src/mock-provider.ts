import {
  addDays,
  computeFingerprint,
  flightOfferSchema,
  type FlightOffer,
  type FlightSearchRequest,
} from "@fbr/flight-domain";
import { ProviderError } from "@fbr/shared";
import { type FlightProvider } from "./provider.js";
import { mulberry32, scenarioPriceCents, type MockScenario } from "./scenarios.js";

export interface MockFlightProviderOptions {
  readonly scenario?: MockScenario;
  readonly name?: string;
  readonly seed?: number;
  /** Prix de référence en euros (unités), converti en centimes en interne. */
  readonly basePriceEur?: number;
  readonly marketingAirline?: string;
  readonly flightNumber?: string;
  /** Latence simulée en ms (utile pour `timeout` et les tests de concurrence). */
  readonly latencyMs?: number;
  /** Destination de repli en mode Radar (requête sans destination). */
  readonly radarFallbackDestination?: string;
  /** Horloge injectable — déterminise `observedAt` dans les tests. */
  readonly now?: () => string;
}

const delay = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/**
 * Provider de test : produit des offres Business déterministes selon un scénario.
 * Aucune I/O réseau. Tient un compteur d'appels pour faire évoluer les scénarios
 * dynamiques (`gradual-drop`, `flash-drop`, `record-low`).
 */
export class MockFlightProvider implements FlightProvider {
  readonly name: string;
  private readonly scenario: MockScenario;
  private readonly basePriceCents: number;
  private readonly marketingAirline: string;
  private readonly flightNumber: string;
  private readonly latencyMs: number;
  private readonly radarFallbackDestination: string;
  private readonly rng: () => number;
  private readonly now: () => string;
  private calls = 0;

  constructor(options: MockFlightProviderOptions = {}) {
    this.name = options.name ?? "mock";
    this.scenario = options.scenario ?? "normal";
    this.basePriceCents = Math.round((options.basePriceEur ?? 1486) * 100);
    this.marketingAirline = (options.marketingAirline ?? "AF").toUpperCase();
    this.flightNumber = options.flightNumber ?? `${this.marketingAirline}276`;
    this.latencyMs = options.latencyMs ?? 0;
    this.radarFallbackDestination = (options.radarFallbackDestination ?? "HND").toUpperCase();
    this.rng = mulberry32(options.seed ?? 1);
    this.now = options.now ?? ((): string => new Date().toISOString());
  }

  /** Nombre d'appels à `searchFlights` depuis la création / le dernier `reset()`. */
  get callCount(): number {
    return this.calls;
  }

  reset(): void {
    this.calls = 0;
  }

  async searchFlights(request: FlightSearchRequest): Promise<FlightOffer[]> {
    const callIndex = this.calls;
    this.calls += 1;

    if (this.latencyMs > 0) await delay(this.latencyMs);

    if (this.scenario === "error") {
      throw new ProviderError("mock: échec provider simulé", {
        retryable: true,
        context: { provider: this.name, scenario: this.scenario },
      });
    }
    if (this.scenario === "timeout") {
      throw new ProviderError("mock: timeout simulé", {
        code: "PROVIDER_TIMEOUT",
        retryable: true,
        context: { provider: this.name },
      });
    }

    const priceCents = scenarioPriceCents(this.scenario, callIndex, this.basePriceCents, this.rng);
    const destinations =
      request.destinations.length > 0 ? request.destinations : [this.radarFallbackDestination];

    return destinations.map((destination) =>
      this.buildOffer(request, destination, priceCents, callIndex),
    );
  }

  private buildOffer(
    request: FlightSearchRequest,
    destination: string,
    priceCents: number,
    callIndex: number,
  ): FlightOffer {
    const outboundDate = request.departureWindow.start;
    const inboundDate = addDays(outboundDate, request.tripDuration.minDays);
    const unavailable = this.scenario === "unavailable";

    const outbound = {
      departureDate: outboundDate,
      departureAt: `${outboundDate}T13:30:00+02:00`,
      arrivalAt: `${addDays(outboundDate, 1)}T09:15:00+09:00`,
      durationMinutes: 705,
      stops: 0,
      marketingAirline: this.marketingAirline,
      flightNumbers: [this.flightNumber],
    };
    const inbound = {
      departureDate: inboundDate,
      departureAt: `${inboundDate}T11:00:00+09:00`,
      arrivalAt: `${inboundDate}T16:30:00+02:00`,
      durationMinutes: 800,
      stops: 0,
      marketingAirline: this.marketingAirline,
      flightNumbers: [`${this.marketingAirline}275`],
    };

    const fingerprint = computeFingerprint({
      origin: request.origin,
      destination,
      cabinClass: request.cabinClass,
      outbound,
      inbound,
    });

    return flightOfferSchema.parse({
      provider: this.name,
      origin: request.origin,
      destination,
      cabinClass: request.cabinClass,
      outbound,
      inbound,
      price: { amount: priceCents, currency: request.currency },
      availability: unavailable ? "WAITLIST" : "AVAILABLE",
      seatsRemaining: unavailable ? 0 : 4,
      bookingUrl: `https://example.test/book/${fingerprint}`,
      observedAt: this.now(),
      fingerprint,
      raw: { scenario: this.scenario, callIndex },
    });
  }
}
