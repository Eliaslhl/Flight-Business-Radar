import { type SearchRow } from "@fbr/database";
import { type SearchLike } from "@fbr/search-engine";

/** Ligne `searches` → sous-ensemble consommé par `@fbr/search-engine` (découplage DB). */
export const toSearchLike = (row: SearchRow): SearchLike => ({
  origin: row.origin,
  destinations: row.destinations,
  cabinClass: row.cabinClass,
  minTripDays: row.minTripDays,
  maxTripDays: row.maxTripDays,
  departureWindowStart: row.departureWindowStart,
  departureWindowEnd: row.departureWindowEnd,
  maxPriceCents: row.maxPriceCents,
  targetPriceCents: row.targetPriceCents,
  currency: row.currency,
  maxStops: row.maxStops,
  preferredAirlines: row.preferredAirlines,
  excludedAirlines: row.excludedAirlines,
});
