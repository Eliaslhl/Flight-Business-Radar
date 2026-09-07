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
import { tpLatestResponseSchema, type TpPriceRow } from "./travelpayouts-contract.js";

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface TravelpayoutsProviderOptions {
  readonly token: string;
  /** Marqueur affilié — active la génération d'un lien de réservation Aviasales. */
  readonly marker?: string;
  readonly timeoutMs?: number;
  readonly name?: string;
  readonly maxDestinations?: number;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => string;
  readonly logger?: { debug: (obj: unknown, msg: string) => void };
}

const BASE_URL = "https://api.travelpayouts.com/v2/prices/latest";

/** `trip_class` Travelpayouts : 0 économie · 1 business · 2 first. */
const tripClassParam = (cabin: FlightSearchRequest["cabinClass"]): number =>
  cabin === "BUSINESS" ? 1 : cabin === "FIRST" ? 2 : 0;

/** ISO 8601, en ajoutant `Z` si Travelpayouts omet le fuseau. `null` si invalide. */
const toIso = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw.trim());
  if (!m) return null;
  const withZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw.trim())
    ? raw.trim().replace(" ", "T")
    : null;
  return withZone ?? `${m[1]!}T${m[2]!}:${m[3]!}:${m[4] ?? "00"}Z`;
};

const ddmm = (isoDay: string): string => `${isoDay.slice(8, 10)}${isoDay.slice(5, 7)}`;

/**
 * Provider **gratuit** Travelpayouts Data API — **données réelles mais en cache**
 * (recherches Aviasales, fraîcheur ~48 h). Pensé pour un radar de tendance /
 * meilleur moment de réservation, en **économie** surtout (le business est très
 * peu représenté). Les flash drops (baisses de quelques minutes) sont hors de
 * portée d'une donnée en cache.
 *
 * 1 appel HTTP = 1 couple de dates × 1 destination. `observedAt` d'une offre =
 * son `found_at` (pas l'heure du sondage) → l'historique reflète la réalité.
 */
export class TravelpayoutsProvider implements FlightProvider {
  readonly name: string;
  private readonly token: string;
  private readonly marker: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxDestinations: number;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => string;
  private readonly logger: TravelpayoutsProviderOptions["logger"];

  constructor(options: TravelpayoutsProviderOptions) {
    this.name = options.name ?? "travelpayouts";
    this.token = options.token;
    this.marker = options.marker;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxDestinations = options.maxDestinations ?? 8;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? ((): string => new Date().toISOString());
    this.logger = options.logger;
  }

  async searchFlights(request: FlightSearchRequest): Promise<FlightOffer[]> {
    if (request.destinations.length === 0) {
      throw new ProviderError("travelpayouts : une destination explicite est requise", {
        retryable: false,
      });
    }
    let destinations = [...request.destinations];
    if (destinations.length > this.maxDestinations) {
      this.logger?.debug(
        { provider: this.name, asked: destinations.length, cap: this.maxDestinations },
        "travelpayouts : nombre de destinations plafonné",
      );
      destinations = destinations.slice(0, this.maxDestinations);
    }

    const outboundDate = request.departureWindow.start;
    const returnDate = addDays(isoDate(outboundDate), request.tripDuration.minDays);

    const perDestination = await Promise.all(
      destinations.map((destination) =>
        this.searchOne(request, destination, outboundDate, returnDate),
      ),
    );
    return perDestination.flat();
  }

  private async searchOne(
    request: FlightSearchRequest,
    destination: string,
    outboundDate: string,
    returnDate: string,
  ): Promise<FlightOffer[]> {
    const tripClass = tripClassParam(request.cabinClass);
    const params = new URLSearchParams({
      token: this.token,
      currency: request.currency.toLowerCase(),
      origin: request.origin,
      destination,
      period_type: "month",
      beginning_of_period: `${outboundDate.slice(0, 7)}-01`,
      one_way: "false",
      trip_class: String(tripClass),
      limit: "1000",
      sorting: "price",
      show_to_affiliates: "true",
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let text: string;
    let status: number;
    try {
      const res = await this.fetchImpl(`${BASE_URL}?${params.toString()}`, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      status = res.status;
      text = await res.text();
      if (!res.ok) {
        const code =
          status === 401
            ? "token Travelpayouts refusé"
            : status === 429
              ? "quota Travelpayouts atteint"
              : `HTTP ${String(status)}`;
        throw new ProviderError(`travelpayouts : ${code}`, { retryable: status >= 500 });
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("travelpayouts : injoignable", {
        code: "PROVIDER_TIMEOUT",
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ProviderError("travelpayouts : réponse non-JSON", { retryable: false });
    }

    const parsed = tpLatestResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new ProviderError("travelpayouts : réponse inattendue", {
        retryable: false,
        context: { issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")) },
      });
    }
    if (parsed.data.success === false) {
      throw new ProviderError(`travelpayouts : ${parsed.data.error ?? "échec"}`, {
        retryable: false,
      });
    }

    const currency = (parsed.data.currency ?? request.currency).toUpperCase();
    return parsed.data.data
      .filter(
        (r) =>
          r.depart_date === outboundDate &&
          (r.return_date ?? null) === returnDate &&
          (r.trip_class === undefined || r.trip_class === tripClass),
      )
      .map((row) => this.toFlightOffer(request, destination, returnDate, currency, row))
      .filter((o): o is FlightOffer => o !== null);
  }

  private toFlightOffer(
    request: FlightSearchRequest,
    destination: string,
    returnDate: string,
    currency: string,
    row: TpPriceRow,
  ): FlightOffer | null {
    const priceUnits = row.value ?? row.price;
    if (!priceUnits || priceUnits <= 0) return null;

    const depDate = row.depart_date;
    const airline = resolveAirlineCode(row.airline);
    const stops = row.number_of_changes ?? row.transfers ?? 0;

    const outbound = {
      departureDate: depDate,
      departureAt: toIso(row.departure_at) ?? `${depDate}T12:00:00Z`,
      arrivalAt: `${depDate}T20:00:00Z`,
      durationMinutes: row.duration && row.duration > 0 ? row.duration : 600,
      stops,
      marketingAirline: airline,
      flightNumbers:
        row.airline && row.flight_number !== undefined
          ? [`${airline}${String(row.flight_number)}`.replace(/\s+/g, "").slice(0, 8)]
          : [],
    };
    const inbound = {
      departureDate: returnDate,
      departureAt: toIso(row.return_at) ?? `${returnDate}T12:00:00Z`,
      arrivalAt: `${returnDate}T20:00:00Z`,
      durationMinutes: outbound.durationMinutes,
      stops: 0,
      marketingAirline: airline,
      flightNumbers: [] as string[],
    };

    const fingerprint = computeFingerprint({
      origin: request.origin,
      destination,
      cabinClass: request.cabinClass,
      outbound,
      inbound,
    });

    const bookingUrl =
      this.marker && /^\d{4}-\d{2}-\d{2}$/.test(depDate)
        ? `https://www.aviasales.com/search/${request.origin}${ddmm(depDate)}${destination}${ddmm(returnDate)}1?marker=${this.marker}&currency=${currency.toLowerCase()}`
        : undefined;

    const candidate = {
      provider: this.name,
      origin: request.origin,
      destination,
      cabinClass: request.cabinClass,
      outbound,
      inbound,
      price: { amount: Math.round(priceUnits * 100), currency },
      availability: "UNKNOWN" as const,
      ...(bookingUrl ? { bookingUrl } : {}),
      observedAt: toIso(row.found_at) ?? this.now(),
      fingerprint,
      raw: { source: "travelpayouts", row },
    };

    const parsed = flightOfferSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }
}
