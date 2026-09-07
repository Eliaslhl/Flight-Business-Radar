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

/** Nombre de nuits entre deux dates ISO (`YYYY-MM-DD`). */
const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

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
  /** Mémo court par `origin|destination|YYYY-MM|currency` — le worker sonde
   *  plusieurs couples de dates du même mois en rafale, or la réponse
   *  `period_type=month` est identique. TTL 15 min (les données changent au
   *  mieux toutes les ~48 h). */
  private readonly monthCache = new Map<string, { rows: TpPriceRow[]; atMs: number }>();
  private static readonly CACHE_TTL_MS = 15 * 60_000;

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
    // Le Data API gratuit ne sert que l'économie (`trip_class=0` ; toute autre
    // valeur ⇒ HTTP 400 « Only economy trip class is supported »). Les cabines
    // supérieures sont simplement hors périmètre de cette source.
    if (request.cabinClass !== "ECONOMY") {
      this.logger?.debug(
        { provider: this.name, cabinClass: request.cabinClass },
        "travelpayouts : cabine non-économie ignorée (source éco uniquement)",
      );
      return [];
    }

    let destinations = [...request.destinations];
    if (destinations.length > this.maxDestinations) {
      this.logger?.debug(
        { provider: this.name, asked: destinations.length, cap: this.maxDestinations },
        "travelpayouts : nombre de destinations plafonné",
      );
      destinations = destinations.slice(0, this.maxDestinations);
    }

    const perDestination = await Promise.all(
      destinations.map((destination) => this.searchOne(request, destination)),
    );
    return perDestination.flat();
  }

  private async searchOne(
    request: FlightSearchRequest,
    destination: string,
  ): Promise<FlightOffer[]> {
    // Le worker cible un couple de dates précis (fenêtre réduite à un jour), mais
    // Travelpayouts ne sert qu'un panorama mensuel en cache : on interroge le
    // mois du départ et on renvoie tous les allers-retours éco plausibles, avec
    // LEURS dates réelles. `recommendDates` / l'analyse trient ensuite.
    const month = request.departureWindow.start.slice(0, 7); // YYYY-MM
    const currency = request.currency.toUpperCase();
    const rows = await this.fetchMonthRows(request.origin, destination, month, currency);

    const today = this.now().slice(0, 10);
    return rows
      .filter((r) => {
        if (r.trip_class !== undefined && r.trip_class !== 0) return false;
        if (r.depart_date.slice(0, 7) !== month) return false;
        if (r.depart_date < today) return false;
        if (r.return_date) {
          const nights = daysBetween(r.depart_date, r.return_date);
          if (nights < 3 || nights > 45) return false;
        }
        return true;
      })
      .map((row) => {
        const returnDate =
          row.return_date ?? addDays(isoDate(row.depart_date), request.tripDuration.minDays);
        return this.toFlightOffer(request, destination, returnDate, currency, row);
      })
      .filter((o): o is FlightOffer => o !== null);
  }

  /** Réponse `period_type=month` pour un couple route/mois, mémoïsée par run. */
  private async fetchMonthRows(
    origin: string,
    destination: string,
    month: string,
    currency: string,
  ): Promise<TpPriceRow[]> {
    const key = `${origin}|${destination}|${month}|${currency}`;
    const nowMs = Date.parse(this.now());
    const cached = this.monthCache.get(key);
    if (cached && nowMs - cached.atMs < TravelpayoutsProvider.CACHE_TTL_MS) return cached.rows;

    // Travelpayouts a retiré l'auth par `?token=` sur la Data API (HTTP 400) :
    // le jeton passe désormais par l'en-tête `X-Access-Token`. `trip_class` est
    // toujours `0` (garde économie faite en amont dans `searchFlights`).
    const params = new URLSearchParams({
      currency: currency.toLowerCase(),
      origin,
      destination,
      period_type: "month",
      beginning_of_period: `${month}-01`,
      one_way: "false",
      trip_class: "0",
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
        headers: { accept: "application/json", "x-access-token": this.token },
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

    const rows = parsed.data.data;
    this.monthCache.set(key, { rows, atMs: nowMs });
    return rows;
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
