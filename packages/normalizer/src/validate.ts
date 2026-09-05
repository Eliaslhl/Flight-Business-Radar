import {
  compareIsoDate,
  daysBetween,
  flightOfferSchema,
  isRadarSearch,
  offerMaxStops,
  type FlightOffer,
  type FlightSearchRequest,
} from "@fbr/flight-domain";
import { err, ok, type Result } from "@fbr/shared";

export type RejectionReason =
  | "MALFORMED"
  | "PRICE_MISSING"
  | "PRICE_IMPLAUSIBLE"
  | "CURRENCY_UNKNOWN"
  | "CURRENCY_MISMATCH"
  | "CABIN_MISMATCH"
  | "ROUTE_MISMATCH"
  | "DATE_INCOHERENT"
  | "STOPS_EXCEEDED"
  | "AIRLINE_EXCLUDED";

export interface RejectedOffer {
  readonly offer: FlightOffer;
  readonly reason: RejectionReason;
  readonly detail: string;
}

export interface ValidateOptions {
  readonly request: FlightSearchRequest;
  /** Devise de référence : la bande de plausibilité ne s'applique qu'à elle (FX en Phase 4). */
  readonly baseCurrency?: string;
  /** Bande de prix plausible en centimes de `baseCurrency`. Défaut : 400 € – 30 000 €. */
  readonly priceBandCents?: { readonly min: number; readonly max: number };
  /** Exiger que la cabine de l'offre corresponde exactement à la demande. Défaut : true. */
  readonly requireCabinMatch?: boolean;
  /** Exiger que la devise de l'offre corresponde à `request.currency`. Défaut : true. */
  readonly requireCurrencyMatch?: boolean;
}

const DEFAULT_BAND = { min: 400_00, max: 30_000_00 } as const;
const CURRENCY_RE = /^[A-Z]{3}$/;

const parseInstant = (iso: string): number => Date.parse(iso);

/**
 * Contrôle qualité d'une offre vis-à-vis d'une recherche (Phase 0 §29).
 * Retourne `Ok(offer)` si l'offre est exploitable, sinon `Err({ reason, detail })`
 * avec le **premier** motif de rejet rencontré (ordre de sévérité décroissante).
 */
export const validateOffer = (
  offer: FlightOffer,
  options: ValidateOptions,
): Result<FlightOffer, RejectedOffer> => {
  const { request } = options;
  const baseCurrency = options.baseCurrency ?? "EUR";
  const band = options.priceBandCents ?? DEFAULT_BAND;
  const requireCabinMatch = options.requireCabinMatch ?? true;
  const requireCurrencyMatch = options.requireCurrencyMatch ?? true;

  const reject = (reason: RejectionReason, detail: string): Result<FlightOffer, RejectedOffer> =>
    err({ offer, reason, detail });

  // 0. Forme : l'offre doit rester conforme au schéma canonique.
  const shape = flightOfferSchema.safeParse(offer);
  if (!shape.success) {
    return reject("MALFORMED", shape.error.issues.map((i) => i.path.join(".")).join(", "));
  }

  // 1. Prix présent et fini.
  if (!Number.isFinite(offer.price.amount) || offer.price.amount <= 0) {
    return reject("PRICE_MISSING", `amount=${String(offer.price.amount)}`);
  }

  // 2. Devise.
  if (!CURRENCY_RE.test(offer.price.currency)) {
    return reject("CURRENCY_UNKNOWN", offer.price.currency);
  }
  if (requireCurrencyMatch && offer.price.currency !== request.currency) {
    return reject("CURRENCY_MISMATCH", `${offer.price.currency} ≠ ${request.currency}`);
  }

  // 3. Cabine.
  if (requireCabinMatch && offer.cabinClass !== request.cabinClass) {
    return reject("CABIN_MISMATCH", `${offer.cabinClass} ≠ ${request.cabinClass}`);
  }

  // 4. Route.
  if (offer.origin !== request.origin) {
    return reject("ROUTE_MISMATCH", `origin ${offer.origin} ≠ ${request.origin}`);
  }
  if (!isRadarSearch(request) && !request.destinations.includes(offer.destination)) {
    return reject("ROUTE_MISMATCH", `destination ${offer.destination} hors demande`);
  }

  // 5. Cohérence des dates.
  const dateError = checkDates(offer, request);
  if (dateError) return reject("DATE_INCOHERENT", dateError);

  // 6. Escales.
  const stops = offerMaxStops(offer);
  if (stops > request.maxStops) {
    return reject("STOPS_EXCEEDED", `${String(stops)} > ${String(request.maxStops)}`);
  }

  // 7. Compagnie exclue.
  const excludedSet = new Set<string>(request.excludedAirlines);
  const airlines: string[] = [
    offer.outbound.marketingAirline,
    offer.inbound?.marketingAirline,
  ].filter((a): a is NonNullable<typeof a> => a != null);
  const excluded = airlines.find((a) => excludedSet.has(a));
  if (excluded) return reject("AIRLINE_EXCLUDED", excluded);

  // 8. Plausibilité du montant (uniquement dans la devise de référence).
  if (offer.price.currency === baseCurrency) {
    if (offer.price.amount < band.min || offer.price.amount > band.max) {
      return reject(
        "PRICE_IMPLAUSIBLE",
        `${String(offer.price.amount)} hors [${String(band.min)}, ${String(band.max)}]`,
      );
    }
  }

  return ok(offer);
};

const checkDates = (offer: FlightOffer, request: FlightSearchRequest): string | null => {
  const { start, end } = request.departureWindow;
  const out = offer.outbound.departureDate;
  if (compareIsoDate(out, start) < 0 || compareIsoDate(out, end) > 0) {
    return `départ ${out} hors fenêtre [${start}, ${end}]`;
  }

  for (const leg of [offer.outbound, offer.inbound]) {
    if (!leg) continue;
    const dep = parseInstant(leg.departureAt);
    const arr = parseInstant(leg.arrivalAt);
    if (Number.isNaN(dep) || Number.isNaN(arr) || arr <= dep) {
      return `segment ${leg.departureAt} → ${leg.arrivalAt} incohérent`;
    }
  }

  if (offer.inbound) {
    const tripDays = daysBetween(offer.outbound.departureDate, offer.inbound.departureDate);
    if (tripDays < 0) return `retour avant l'aller (${String(tripDays)}j)`;
    const { minDays, maxDays } = request.tripDuration;
    if (tripDays < minDays || tripDays > maxDays) {
      return `durée de séjour ${String(tripDays)}j hors [${String(minDays)}, ${String(maxDays)}]`;
    }
  }

  return null;
};
