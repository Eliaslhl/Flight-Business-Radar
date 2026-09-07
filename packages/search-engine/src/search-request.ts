import {
  daysBetween,
  flightSearchRequestSchema,
  isoDate,
  type CabinClass,
  type FlightSearchRequest,
} from "@fbr/flight-domain";

/** Sous-ensemble d'une recherche stockée dont le moteur a besoin (découplé de `@fbr/database`). */
export interface SearchLike {
  readonly origin: string;
  readonly destinations: readonly string[];
  readonly cabinClass: CabinClass;
  readonly minTripDays: number;
  readonly maxTripDays: number;
  readonly departureWindowStart: string;
  readonly departureWindowEnd: string;
  readonly maxPriceCents: number | null;
  readonly targetPriceCents: number | null;
  readonly currency: string;
  readonly maxStops: number;
  readonly preferredAirlines: readonly string[];
  readonly excludedAirlines: readonly string[];
}

export interface CombinationLike {
  readonly outboundDate: string;
  readonly returnDate: string | null;
  readonly tripDays: number | null;
}

const money = (
  cents: number | null,
  currency: string,
): { amount: number; currency: string } | undefined =>
  cents === null ? undefined : { amount: cents, currency };

export interface BuildRequestOptions {
  /**
   * Remplace les destinations de la recherche (mode Radar : le worker sonde une
   * tranche rotative de la liste seed au lieu d'aucune destination).
   */
  readonly destinations?: readonly string[];
}

/**
 * Construit une `FlightSearchRequest` ciblant **exactement** une combinaison de
 * dates (fenêtre réduite à un jour, durée de séjour fixée). Lève si le résultat
 * n'est pas valide au regard du schéma domaine.
 */
export const buildRequestForCombination = (
  search: SearchLike,
  combo: CombinationLike,
  options: BuildRequestOptions = {},
): FlightSearchRequest => {
  const outbound = isoDate(combo.outboundDate);
  const tripDays =
    combo.tripDays ??
    (combo.returnDate ? daysBetween(outbound, isoDate(combo.returnDate)) : search.minTripDays);

  return flightSearchRequestSchema.parse({
    origin: search.origin,
    destinations: [...(options.destinations ?? search.destinations)],
    cabinClass: search.cabinClass,
    departureWindow: { start: outbound, end: outbound },
    tripDuration: { minDays: tripDays, maxDays: tripDays },
    maxStops: search.maxStops,
    maxPrice: money(search.maxPriceCents, search.currency),
    targetPrice: money(search.targetPriceCents, search.currency),
    currency: search.currency,
    preferredAirlines: [...search.preferredAirlines],
    excludedAirlines: [...search.excludedAirlines],
  });
};

export interface OfferLike {
  readonly destination: string;
  readonly outboundDate: string;
  readonly returnDate: string | null;
  readonly tripDays: number | null;
}

/**
 * Construit une requête ciblant **exactement l'itinéraire d'une offre connue**
 * (re-vérification d'un prix — Phase 0 §10).
 */
export const buildRequestForOffer = (search: SearchLike, offer: OfferLike): FlightSearchRequest => {
  const outbound = isoDate(offer.outboundDate);
  const tripDays =
    offer.tripDays ??
    (offer.returnDate ? daysBetween(outbound, isoDate(offer.returnDate)) : search.minTripDays);

  return flightSearchRequestSchema.parse({
    origin: search.origin,
    destinations: [offer.destination],
    cabinClass: search.cabinClass,
    departureWindow: { start: outbound, end: outbound },
    tripDuration: { minDays: tripDays, maxDays: tripDays },
    maxStops: search.maxStops,
    maxPrice: money(search.maxPriceCents, search.currency),
    targetPrice: money(search.targetPriceCents, search.currency),
    currency: search.currency,
    preferredAirlines: [...search.preferredAirlines],
    excludedAirlines: [...search.excludedAirlines],
  });
};

/** Construit la requête « pleine fenêtre » (utile pour la génération de combinaisons / le mode Radar). */
export const buildWindowRequest = (search: SearchLike): FlightSearchRequest =>
  flightSearchRequestSchema.parse({
    origin: search.origin,
    destinations: [...search.destinations],
    cabinClass: search.cabinClass,
    departureWindow: { start: search.departureWindowStart, end: search.departureWindowEnd },
    tripDuration: { minDays: search.minTripDays, maxDays: search.maxTripDays },
    maxStops: search.maxStops,
    maxPrice: money(search.maxPriceCents, search.currency),
    targetPrice: money(search.targetPriceCents, search.currency),
    currency: search.currency,
    preferredAirlines: [...search.preferredAirlines],
    excludedAirlines: [...search.excludedAirlines],
  });
