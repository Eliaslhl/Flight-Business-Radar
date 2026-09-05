import { type FlightOffer, type FlightSearchRequest } from "@fbr/flight-domain";
import { partitionResults } from "@fbr/shared";
import { dedupeOffers, type DedupeOptions } from "./dedupe.js";
import { validateOffer, type RejectedOffer, type ValidateOptions } from "./validate.js";

export interface NormalizeOptions extends Omit<ValidateOptions, "request">, DedupeOptions {}

export interface NormalizeStats {
  readonly received: number;
  readonly rejected: number;
  readonly duplicates: number;
  readonly kept: number;
}

export interface NormalizeResult {
  /** Offres valides et dédupliquées, prêtes pour le stockage / l'analyse. */
  readonly offers: FlightOffer[];
  readonly rejected: RejectedOffer[];
  readonly duplicates: FlightOffer[];
  readonly stats: NormalizeStats;
}

/**
 * Couche de normalisation (Phase 0 §4) : valide chaque offre issue des providers
 * puis déduplique. Ne lève jamais — les offres invalides sont rapportées dans
 * `rejected` avec leur motif.
 */
export const normalizeSearchResults = (
  request: FlightSearchRequest,
  offers: readonly FlightOffer[],
  options: NormalizeOptions = {},
): NormalizeResult => {
  const { preferProviders, ...validateOpts } = options;

  const results = offers.map((offer) => validateOffer(offer, { request, ...validateOpts }));
  const { values: valid, errors: rejected } = partitionResults(results);

  const dedupeOpts: DedupeOptions = preferProviders ? { preferProviders } : {};
  const { kept, duplicates } = dedupeOffers(valid, dedupeOpts);

  return {
    offers: kept,
    rejected,
    duplicates,
    stats: {
      received: offers.length,
      rejected: rejected.length,
      duplicates: duplicates.length,
      kept: kept.length,
    },
  };
};
