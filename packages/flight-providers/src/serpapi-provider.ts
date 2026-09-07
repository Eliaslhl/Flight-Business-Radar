import {
  addDays,
  computeFingerprint,
  flightOfferSchema,
  isoDate,
  type FlightSearchRequest,
  type FlightOffer,
} from "@fbr/flight-domain";
import { ProviderError } from "@fbr/shared";
import { resolveAirlineCode } from "./airline-codes.js";
import { type FlightProvider } from "./provider.js";
import { serpApiFlightsResponseSchema, type SerpFlightOption } from "./serpapi-contract.js";

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface SerpApiProviderOptions {
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly name?: string;
  /** @deprecated SerpApi n'est plus utilisé qu'en point-à-point (une destination). */
  readonly maxDestinations?: number;
  /** `deep_search=true` : prix plus fidèles à Google Flights, réponse plus lente. */
  readonly deepSearch?: boolean;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => string;
  readonly logger?: { debug: (obj: unknown, msg: string) => void };
}

const BASE_URL = "https://serpapi.com/search.json";

/** `travel_class` SerpApi : 1 Economy · 2 Premium economy · 3 Business · 4 First. */
const TRAVEL_CLASS = { ECONOMY: "1", PREMIUM_ECONOMY: "2", BUSINESS: "3", FIRST: "4" } as const;
type CabinClass = FlightSearchRequest["cabinClass"];
/** Cabines interrogées à chaque passage : on remonte les 3 moins chères, cabine mélangée. */
const CABINS_QUERIED: readonly CabinClass[] = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS"];

/** `stops` SerpApi : 0 indifférent · 1 direct · 2 ≤ 1 escale · 3 ≤ 2 escales. */
const stopsParam = (maxStops: number): string =>
  maxStops <= 0 ? "1" : maxStops === 1 ? "2" : maxStops === 2 ? "3" : "0";

const NO_RESULT_RE = /no.*result|hasn't returned|couldn't find|no flights/i;

/** « 2026-11-10 10:15 » (heure locale sans fuseau) → « 2026-11-10T10:15:00Z » (nominal). */
const toIso = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/.exec(raw.trim());
  return m ? `${m[1]!}T${m[2]!}:${m[3]!}:00Z` : null;
};

const dateOf = (iso: string | null, fallback: string): string =>
  iso ? iso.slice(0, 10) : fallback;

/** « AF 276 » / « AF276 » → « AF276 » (2–8 caractères) sinon `null`. */
const normalizeFlightNumber = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, "").toUpperCase();
  return cleaned.length >= 2 && cleaned.length <= 8 ? cleaned : null;
};

/**
 * Provider **payant** SerpApi Google Flights (Phase 0 §2, 1er provider réel). Un
 * appel = un couple de dates × une destination = **un crédit SerpApi**. La
 * réponse est convertie en `FlightOffer` ici (Phase 0 §27) ; le trajet retour
 * n'est pas détaillé par le 1er appel SerpApi (flow round-trip en 2 temps) : il
 * est synthétisé de façon déterministe, le **prix total** lui est réel.
 */
export class SerpApiFlightProvider implements FlightProvider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly deepSearch: boolean;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => string;
  private readonly logger: SerpApiProviderOptions["logger"];

  constructor(options: SerpApiProviderOptions) {
    this.name = options.name ?? "serpapi";
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.deepSearch = options.deepSearch ?? false;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? ((): string => new Date().toISOString());
    this.logger = options.logger;
  }

  async searchFlights(request: FlightSearchRequest): Promise<FlightOffer[]> {
    // Garde-fou budget : SerpApi (1 appel = 1 crédit) est réservé aux recherches
    // point-à-point (une destination). Les radars / analyses par continent
    // restent sur la source gratuite en cache.
    if (request.destinations.length !== 1) {
      this.logger?.debug(
        { provider: this.name, destinations: request.destinations.length },
        "serpapi : ignoré (réservé aux recherches point-à-point)",
      );
      return [];
    }
    const destination = request.destinations[0]!;

    const outboundDate = request.departureWindow.start;
    const returnDate = addDays(isoDate(outboundDate), request.tripDuration.minDays);

    // 1 appel par cabine → on renvoie tout, l'analyse gardera les 3 moins chers.
    const perCabin = await Promise.all(
      CABINS_QUERIED.map((cabin) =>
        this.searchOne(request, destination, outboundDate, returnDate, cabin),
      ),
    );
    return perCabin.flat();
  }

  private async searchOne(
    request: FlightSearchRequest,
    destination: string,
    outboundDate: string,
    returnDate: string,
    cabin: CabinClass,
  ): Promise<FlightOffer[]> {
    const params = new URLSearchParams({
      engine: "google_flights",
      api_key: this.apiKey,
      departure_id: request.origin,
      arrival_id: destination,
      outbound_date: outboundDate,
      return_date: returnDate,
      type: "1",
      travel_class: TRAVEL_CLASS[cabin],
      stops: stopsParam(request.maxStops),
      currency: request.currency,
      adults: String(request.passengers.adults),
      hl: "en",
      gl: "fr",
    });
    if (this.deepSearch) params.set("deep_search", "true");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let bodyText: string;
    let status: number;
    try {
      const res = await this.fetchImpl(`${BASE_URL}?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      status = res.status;
      bodyText = await res.text();
      if (!res.ok) {
        const retryable = status >= 500;
        const code =
          status === 401
            ? "clé SerpApi refusée"
            : status === 429
              ? "quota SerpApi atteint"
              : `HTTP ${String(status)}`;
        throw new ProviderError(`serpapi : ${code}`, { retryable });
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("serpapi : injoignable", {
        code: "PROVIDER_TIMEOUT",
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }

    let json: unknown;
    try {
      json = JSON.parse(bodyText);
    } catch {
      throw new ProviderError("serpapi : réponse non-JSON", { retryable: false });
    }

    const parsed = serpApiFlightsResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new ProviderError("serpapi : réponse inattendue", {
        retryable: false,
        context: { issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")) },
      });
    }

    if (parsed.data.error) {
      if (NO_RESULT_RE.test(parsed.data.error)) return [];
      throw new ProviderError(`serpapi : ${parsed.data.error}`, { retryable: false });
    }

    const options = [...parsed.data.best_flights, ...parsed.data.other_flights];
    const priceInsights = parsed.data.price_insights ?? null;
    return options
      .map((opt) =>
        this.toFlightOffer(
          request,
          destination,
          outboundDate,
          returnDate,
          cabin,
          opt,
          priceInsights,
        ),
      )
      .filter((o): o is FlightOffer => o !== null);
  }

  private toFlightOffer(
    request: FlightSearchRequest,
    destination: string,
    outboundDate: string,
    returnDate: string,
    cabin: CabinClass,
    option: SerpFlightOption,
    priceInsights: unknown,
  ): FlightOffer | null {
    if (!option.price || option.price <= 0) return null;

    const legs = option.flights;
    const first = legs[0]!;
    const last = legs[legs.length - 1]!;
    const depIso = toIso(first.departure_airport.time);
    const arrIso = toIso(last.arrival_airport.time);
    const obDate = dateOf(depIso, outboundDate);

    const summed = legs.reduce((sum, l) => sum + (l.duration ?? 0), 0);
    const durationMinutes = option.total_duration ?? (summed > 0 ? summed : 600);

    const outboundAirline = resolveAirlineCode(first.airline);
    const outbound = {
      departureDate: obDate,
      departureAt: depIso ?? `${obDate}T12:00:00Z`,
      arrivalAt: arrIso ?? `${obDate}T20:00:00Z`,
      durationMinutes,
      stops: Math.max(legs.length - 1, option.layovers.length),
      marketingAirline: outboundAirline,
      flightNumbers: legs
        .map((l) => normalizeFlightNumber(l.flight_number))
        .filter((n): n is string => n !== null),
    };

    // Trajet retour non détaillé par le 1er appel SerpApi → synthèse déterministe
    // (même compagnie, dates de la requête). Le prix total, lui, est réel.
    const inbound = {
      departureDate: returnDate,
      departureAt: `${returnDate}T12:00:00Z`,
      arrivalAt: `${returnDate}T20:00:00Z`,
      durationMinutes: outbound.durationMinutes,
      stops: outbound.stops,
      marketingAirline: outboundAirline,
      flightNumbers: [] as string[],
    };

    const fingerprint = computeFingerprint({
      origin: request.origin,
      destination,
      cabinClass: cabin,
      outbound,
      inbound,
    });

    const candidate = {
      provider: this.name,
      origin: request.origin,
      destination,
      cabinClass: cabin,
      outbound,
      inbound,
      price: { amount: Math.round(option.price * 100), currency: request.currency },
      availability: "UNKNOWN" as const,
      observedAt: this.now(),
      fingerprint,
      raw: {
        source: "serpapi",
        option,
        ...(priceInsights ? { priceInsights } : {}),
      },
    };

    const parsed = flightOfferSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }
}
