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
import {
  duffelErrorResponseSchema,
  duffelOfferRequestResponseSchema,
  type DuffelOffer,
  type DuffelSlice,
} from "./duffel-contract.js";
import { type FlightProvider } from "./provider.js";

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface DuffelProviderOptions {
  readonly token: string;
  readonly timeoutMs?: number;
  readonly name?: string;
  readonly maxDestinations?: number;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => string;
  readonly logger?: { debug: (obj: unknown, msg: string) => void };
}

const API_URL = "https://api.duffel.com/air/offer_requests?return_offers=true";

const CABIN_MAP: Record<FlightSearchRequest["cabinClass"], string> = {
  ECONOMY: "economy",
  PREMIUM_ECONOMY: "premium_economy",
  BUSINESS: "business",
  FIRST: "first",
};

/** « PT13H40M » → 820 (minutes). `null` si non parsable. */
const durationToMinutes = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const m = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?/.exec(iso);
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
};

/** Duffel renvoie « 2026-11-10T13:30:00 » sans fuseau → suffixe `Z` nominal. */
const toIsoDateTime = (raw: string): string =>
  /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`;

/**
 * Provider Duffel (API v2) — **oracle de confirmation** (Phase 0 §2/§10) : contenu
 * NDC/GDS réellement réservable. Le pipeline d'alerte l'interroge pour valider
 * une baisse exceptionnelle avant de notifier, indépendamment du provider de
 * recherche. Un `offer_request` = une facturation Duffel (recherche).
 */
export class DuffelFlightProvider implements FlightProvider {
  readonly name: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly maxDestinations: number;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => string;
  private readonly logger: DuffelProviderOptions["logger"];

  constructor(options: DuffelProviderOptions) {
    this.name = options.name ?? "duffel";
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxDestinations = options.maxDestinations ?? 4;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? ((): string => new Date().toISOString());
    this.logger = options.logger;
  }

  async searchFlights(request: FlightSearchRequest): Promise<FlightOffer[]> {
    if (request.destinations.length === 0) {
      throw new ProviderError("duffel : une destination explicite est requise", {
        retryable: false,
      });
    }
    let destinations = [...request.destinations];
    if (destinations.length > this.maxDestinations) {
      this.logger?.debug(
        { provider: this.name, asked: destinations.length, cap: this.maxDestinations },
        "duffel : nombre de destinations plafonné (garde-fou coût)",
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
    const body = JSON.stringify({
      data: {
        slices: [
          { origin: request.origin, destination, departure_date: outboundDate },
          { origin: destination, destination: request.origin, departure_date: returnDate },
        ],
        passengers: Array.from({ length: Math.max(request.passengers.adults, 1) }, () => ({
          type: "adult",
        })),
        cabin_class: CABIN_MAP[request.cabinClass],
        max_connections: Math.min(Math.max(request.maxStops, 0), 2),
      },
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let text: string;
    let status: number;
    try {
      const res = await this.fetchImpl(API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          "Duffel-Version": "v2",
          "content-type": "application/json",
          accept: "application/json",
        },
        body,
        signal: controller.signal,
      });
      status = res.status;
      text = await res.text();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("duffel : injoignable", {
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
      throw new ProviderError("duffel : réponse non-JSON", { retryable: false });
    }

    if (status < 200 || status >= 300) {
      const parsedErr = duffelErrorResponseSchema.safeParse(json);
      const detail = parsedErr.success
        ? (parsedErr.data.errors[0]?.title ?? parsedErr.data.errors[0]?.message ?? "")
        : "";
      const code =
        status === 401
          ? "token Duffel refusé"
          : status === 429
            ? "quota Duffel atteint"
            : `HTTP ${String(status)}`;
      throw new ProviderError(`duffel : ${code}${detail ? ` — ${detail}` : ""}`, {
        retryable: status >= 500,
      });
    }

    const parsed = duffelOfferRequestResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new ProviderError("duffel : réponse inattendue", {
        retryable: false,
        context: { issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join(".")) },
      });
    }

    return parsed.data.data.offers
      .map((offer) => this.toFlightOffer(request, destination, outboundDate, returnDate, offer))
      .filter((o): o is FlightOffer => o !== null);
  }

  private buildLeg(slice: DuffelSlice, fallbackDate: string, ownerCode: string) {
    const segments = slice.segments;
    const first = segments[0]!;
    const last = segments[segments.length - 1]!;
    const departureAt = toIsoDateTime(first.departing_at);
    const arrivalAt = toIsoDateTime(last.arriving_at);
    const flightNumbers = segments
      .map((s) => {
        const carrier = resolveAirlineCode(s.marketing_carrier?.iata_code ?? ownerCode);
        const num = (s.marketing_carrier_flight_number ?? "").replace(/\s+/g, "");
        return num ? `${carrier}${num}`.slice(0, 8) : null;
      })
      .filter((n): n is string => n !== null && n.length >= 2);

    const summed = segments.reduce((sum, s) => sum + (durationToMinutes(s.duration) ?? 0), 0);
    const durationMinutes = durationToMinutes(slice.duration) ?? (summed > 0 ? summed : 600);

    return {
      departureDate: /^\d{4}-\d{2}-\d{2}/.test(departureAt)
        ? departureAt.slice(0, 10)
        : fallbackDate,
      departureAt,
      arrivalAt,
      durationMinutes,
      stops: segments.length - 1,
      marketingAirline: resolveAirlineCode(first.marketing_carrier?.iata_code ?? ownerCode),
      flightNumbers,
    };
  }

  private toFlightOffer(
    request: FlightSearchRequest,
    destination: string,
    outboundDate: string,
    returnDate: string,
    offer: DuffelOffer,
  ): FlightOffer | null {
    const amount = Number.parseFloat(offer.total_amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const ownerCode = resolveAirlineCode(offer.owner?.iata_code);
    const outbound = this.buildLeg(offer.slices[0]!, outboundDate, ownerCode);
    const inbound = offer.slices[1] ? this.buildLeg(offer.slices[1], returnDate, ownerCode) : null;

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
      price: { amount: Math.round(amount * 100), currency: offer.total_currency.toUpperCase() },
      // Une offre Duffel est du contenu réellement réservable.
      availability: "AVAILABLE" as const,
      observedAt: this.now(),
      fingerprint,
      raw: { source: "duffel", offerId: offer.id, offer },
    };

    const parsed = flightOfferSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }
}
