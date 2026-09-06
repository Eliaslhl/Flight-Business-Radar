import {
  addDays,
  computeFingerprint,
  flightOfferSchema,
  isoDate,
  type FlightOffer,
  type FlightSearchRequest,
} from "@fbr/flight-domain";
import { ProviderError } from "@fbr/shared";
import { resolveAirlineCode } from "./airline-codes.js";
import { type FlightProvider } from "./provider.js";
import { scraperResponseSchema, type ScraperLeg, type ScraperOffer } from "./scraper-contract.js";

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface FastFlightsProviderOptions {
  /** URL de base du sidecar (`services/flight-scraper`), ex. `http://localhost:8000`. */
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly name?: string;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => string;
}

const CABIN_MAP: Record<FlightSearchRequest["cabinClass"], string> = {
  ECONOMY: "economy",
  PREMIUM_ECONOMY: "premium-economy",
  BUSINESS: "business",
  FIRST: "first",
};

/**
 * Provider s'appuyant sur le sidecar `fast-flights` (Phase 7). Convertit lui-même
 * la réponse vers `FlightOffer` (Phase 0 §27). Une réponse vide/dégradée n'est
 * **pas** une erreur (un scraper qui ne trouve rien est normal) ; en revanche un
 * timeout / 5xx / payload invalide lève une `ProviderError`.
 */
export class FastFlightsProvider implements FlightProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => string;

  constructor(options: FastFlightsProviderOptions) {
    this.name = options.name ?? "fast-flights";
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? ((): string => new Date().toISOString());
  }

  async searchFlights(request: FlightSearchRequest): Promise<FlightOffer[]> {
    const destinations =
      request.destinations.length > 0
        ? request.destinations
        : (() => {
            throw new ProviderError(
              "fast-flights: le mode Radar (sans destination) n'est pas supporté",
              {
                retryable: false,
              },
            );
          })();

    const outboundDate = request.departureWindow.start;
    const tripDays = request.tripDuration.minDays;
    const returnDate = addDays(isoDate(outboundDate), tripDays);

    const perDestination = await Promise.all(
      destinations.map((destination) =>
        this.searchOne(request, destination, outboundDate, returnDate, tripDays),
      ),
    );
    return perDestination.flat();
  }

  private async searchOne(
    request: FlightSearchRequest,
    destination: string,
    outboundDate: string,
    returnDate: string,
    tripDays: number,
  ): Promise<FlightOffer[]> {
    const body = JSON.stringify({
      origin: request.origin,
      destination,
      outboundDate,
      returnDate,
      cabinClass: CABIN_MAP[request.cabinClass],
      currency: request.currency,
      maxStops: request.maxStops,
      passengers: request.passengers.adults,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let payload: unknown;
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new ProviderError(`fast-flights sidecar HTTP ${String(res.status)}`, {
          retryable: res.status >= 500,
        });
      }
      payload = await res.json();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("fast-flights sidecar injoignable", {
        code: "PROVIDER_TIMEOUT",
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }

    const parsed = scraperResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError("fast-flights: réponse du sidecar invalide", {
        retryable: false,
        context: { issues: parsed.error.issues.map((i) => i.path.join(".")) },
      });
    }

    // Réponse dégradée / vide : pas d'offre, pas d'erreur.
    return parsed.data.offers
      .map((offer) =>
        this.toFlightOffer(request, destination, outboundDate, returnDate, tripDays, offer),
      )
      .filter((o): o is FlightOffer => o !== null);
  }

  private toFlightOffer(
    request: FlightSearchRequest,
    destination: string,
    outboundDate: string,
    returnDate: string,
    tripDays: number,
    raw: ScraperOffer,
  ): FlightOffer | null {
    const buildLeg = (leg: ScraperLeg, date: string, fallbackDep: string, fallbackArr: string) => ({
      departureDate: date,
      departureAt: leg.departureAt ?? `${date}T${fallbackDep}:00+00:00`,
      arrivalAt: leg.arrivalAt ?? `${date}T${fallbackArr}:00+00:00`,
      durationMinutes: leg.durationMinutes ?? 600,
      stops: leg.stops,
      marketingAirline: resolveAirlineCode(leg.airlineCode ?? leg.airlineName),
      flightNumbers: leg.flightNumbers,
    });

    const outbound = buildLeg(raw.outbound, outboundDate, "12:00", "18:00");
    const inbound = raw.inbound ? buildLeg(raw.inbound, returnDate, "12:00", "18:00") : null;

    const fingerprint = computeFingerprint({
      origin: request.origin,
      destination,
      cabinClass: request.cabinClass,
      outbound,
      inbound,
    });

    const candidate = {
      provider: this.name,
      origin: request.origin,
      destination,
      cabinClass: request.cabinClass,
      outbound,
      inbound,
      price: { amount: raw.priceCents, currency: raw.currency },
      availability: "UNKNOWN" as const,
      ...(raw.bookingUrl ? { bookingUrl: raw.bookingUrl } : {}),
      observedAt: this.now(),
      fingerprint,
      raw: { ...raw, tripDays },
    };

    const parsed = flightOfferSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }
}
