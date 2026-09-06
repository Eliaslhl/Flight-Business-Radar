import {
  countCombinations,
  markCombinationsChecked,
  pickCombinations,
  replaceCombinations,
  getSearch,
  updateSearchSchedule,
  upsertOffer,
  upsertProviderLink,
  insertSnapshots,
  type Database,
  type SearchDateCombinationRow,
  type SearchRow,
} from "@fbr/database";
import { daysBetween, isoDate, offerMaxStops, type FlightOffer } from "@fbr/flight-domain";
import { type ProviderRegistry } from "@fbr/flight-providers";
import { normalizeSearchResults } from "@fbr/normalizer";
import { type SearchRunJobData } from "@fbr/queue";
import {
  buildRequestForCombination,
  computeNextIntervalSeconds,
  computeSearchPriority,
  generateDateCombinations,
  type SearchLike,
} from "@fbr/search-engine";
import { LogEvent, type Logger } from "@fbr/shared";
import type { InsertSnapshotInput } from "@fbr/database";

export interface SearchProcessorDeps {
  readonly db: Database;
  readonly registry: ProviderRegistry;
  readonly logger: Logger;
  readonly combinationsPerRun: number;
  readonly providerMinIntervalSeconds: number;
  /** Horloge injectable (tests). */
  readonly now?: () => Date;
}

export interface SearchRunSummary {
  readonly searchId: string;
  readonly skipped?: "not_found" | "not_active" | "no_combinations";
  readonly combinations: number;
  readonly offersKept: number;
  readonly snapshotsInserted: number;
  readonly bestPriceCents: number | null;
  readonly providerErrors: number;
  readonly tier?: string;
  readonly nextIntervalSeconds?: number;
}

const toSearchLike = (row: SearchRow): SearchLike => ({
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

const ensureCombinations = async (deps: SearchProcessorDeps, search: SearchRow): Promise<void> => {
  if ((await countCombinations(deps.db, search.id)) > 0) return;
  const combos = generateDateCombinations({
    departureWindowStart: search.departureWindowStart,
    departureWindowEnd: search.departureWindowEnd,
    minTripDays: search.minTripDays,
    maxTripDays: search.maxTripDays,
  });
  await replaceCombinations(
    deps.db,
    search.id,
    combos.map((c) => ({
      outboundDate: c.outboundDate,
      returnDate: c.returnDate,
      tripDays: c.tripDays,
      priorityScore: c.priorityScore,
    })),
  );
  deps.logger.info(
    { event: "search_combinations_generated", searchId: search.id, count: combos.length },
    "combinaisons de dates générées",
  );
};

const persistOffers = async (
  deps: SearchProcessorDeps,
  search: SearchRow,
  combo: SearchDateCombinationRow,
  offers: readonly FlightOffer[],
): Promise<InsertSnapshotInput[]> => {
  const snapshots: InsertSnapshotInput[] = [];
  for (const offer of offers) {
    const { id: flightOfferId } = await upsertOffer(deps.db, {
      fingerprint: offer.fingerprint,
      origin: offer.origin,
      destination: offer.destination,
      cabinClass: offer.cabinClass,
      outboundDate: offer.outbound.departureDate,
      returnDate: offer.inbound?.departureDate ?? null,
      tripDays: combo.tripDays,
      marketingAirline: offer.outbound.marketingAirline,
      maxStops: offerMaxStops(offer),
      payload: offer,
    });
    await upsertProviderLink(deps.db, {
      flightOfferId,
      provider: offer.provider,
      ...(offer.bookingUrl ? { bookingUrl: offer.bookingUrl } : {}),
    });
    snapshots.push({
      flightOfferId,
      searchId: search.id,
      provider: offer.provider,
      priceCents: offer.price.amount,
      currency: offer.price.currency,
      availability: offer.availability,
      seatsRemaining: offer.seatsRemaining ?? null,
      observedAt: new Date(offer.observedAt),
    });
  }
  return snapshots;
};

/**
 * Traite un job `search.run` : (re)génère les combinaisons si besoin, sonde les
 * `combinationsPerRun` plus prioritaires via `ProviderRegistry`, normalise,
 * **ajoute** des `price_snapshots` (append-only), met à jour l'ordonnancement
 * adaptatif de la recherche.
 */
export const processSearchRun = async (
  deps: SearchProcessorDeps,
  job: SearchRunJobData,
): Promise<SearchRunSummary> => {
  const now = deps.now ?? ((): Date => new Date());
  const runAt = now();

  const search = await getSearch(deps.db, job.searchId);
  if (!search) {
    deps.logger.warn(
      { event: LogEvent.SearchStarted, searchId: job.searchId },
      "recherche introuvable",
    );
    return {
      searchId: job.searchId,
      skipped: "not_found",
      combinations: 0,
      offersKept: 0,
      snapshotsInserted: 0,
      bestPriceCents: null,
      providerErrors: 0,
    };
  }

  if (job.reason === "scheduled" && search.status !== "ACTIVE") {
    return {
      searchId: search.id,
      skipped: "not_active",
      combinations: 0,
      offersKept: 0,
      snapshotsInserted: 0,
      bestPriceCents: null,
      providerErrors: 0,
    };
  }

  deps.logger.info(
    { event: LogEvent.SearchStarted, searchId: search.id, reason: job.reason },
    "recherche démarrée",
  );

  await ensureCombinations(deps, search);
  const picked = await pickCombinations(deps.db, search.id, deps.combinationsPerRun);
  if (picked.length === 0) {
    return {
      searchId: search.id,
      skipped: "no_combinations",
      combinations: 0,
      offersKept: 0,
      snapshotsInserted: 0,
      bestPriceCents: null,
      providerErrors: 0,
    };
  }

  const searchLike = toSearchLike(search);
  const allSnapshots: InsertSnapshotInput[] = [];
  let offersKept = 0;
  let providerErrors = 0;
  let bestPriceCents: number | null = null;

  for (const combo of picked) {
    const request = buildRequestForCombination(searchLike, combo);
    const { offers, outcomes } = await deps.registry.searchAll(request);
    providerErrors += outcomes.filter((o) => !o.ok).length;

    const normalized = normalizeSearchResults(request, offers, { baseCurrency: search.currency });
    offersKept += normalized.offers.length;

    for (const offer of normalized.offers) {
      if (bestPriceCents === null || offer.price.amount < bestPriceCents) {
        bestPriceCents = offer.price.amount;
      }
    }
    allSnapshots.push(...(await persistOffers(deps, search, combo, normalized.offers)));
  }

  const snapshotsInserted = await insertSnapshots(deps.db, allSnapshots);
  await markCombinationsChecked(
    deps.db,
    picked.map((c) => c.id),
    runAt,
  );

  const daysUntilDeparture = daysBetween(
    isoDate(runAt.toISOString().slice(0, 10)),
    isoDate(search.departureWindowStart),
  );
  const hasOffers = allSnapshots.length > 0;
  const { tier, intervalSeconds } = computeNextIntervalSeconds(
    {
      hasOffers,
      ...(bestPriceCents !== null ? { bestPriceCents } : {}),
      ...(search.targetPriceCents !== null ? { targetPriceCents: search.targetPriceCents } : {}),
      ...(search.maxPriceCents !== null ? { maxPriceCents: search.maxPriceCents } : {}),
      daysUntilDeparture,
    },
    { providerMinIntervalSeconds: deps.providerMinIntervalSeconds },
  );
  const priority = computeSearchPriority({
    daysUntilWindowStart: daysUntilDeparture,
    hasOffers,
    ...(bestPriceCents !== null ? { bestPriceCents } : {}),
    ...(search.targetPriceCents !== null ? { targetPriceCents: search.targetPriceCents } : {}),
    ...(search.maxPriceCents !== null ? { maxPriceCents: search.maxPriceCents } : {}),
  });

  await updateSearchSchedule(deps.db, search.id, {
    nextRunAt: new Date(runAt.getTime() + intervalSeconds * 1000),
    lastRunAt: runAt,
    intervalSeconds,
    priority,
  });

  deps.logger.info(
    {
      event: LogEvent.SearchCompleted,
      searchId: search.id,
      combinations: picked.length,
      offersKept,
      snapshotsInserted,
      bestPriceCents,
      tier,
      nextIntervalSeconds: intervalSeconds,
      providerErrors,
    },
    "recherche terminée",
  );

  return {
    searchId: search.id,
    combinations: picked.length,
    offersKept,
    snapshotsInserted,
    bestPriceCents,
    providerErrors,
    tier,
    nextIntervalSeconds: intervalSeconds,
  };
};
