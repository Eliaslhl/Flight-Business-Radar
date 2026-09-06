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
import { type NotificationService } from "@fbr/notifications";
import { normalizeSearchResults } from "@fbr/normalizer";
import { type SearchRunJobData } from "@fbr/queue";
import {
  buildRequestForCombination,
  computeNextIntervalSeconds,
  computeSearchPriority,
  generateDateCombinations,
} from "@fbr/search-engine";
import { type DropThresholds } from "@fbr/analytics";
import { LogEvent, type Logger } from "@fbr/shared";
import type { InsertSnapshotInput } from "@fbr/database";
import { analyzeOffers } from "./analyzer.js";
import { runAlertPipeline } from "./alert-pipeline.js";
import { type ConfirmFn } from "./confirmer.js";
import { toSearchLike } from "./mappers.js";

export interface SearchProcessorDeps {
  readonly db: Database;
  readonly registry: ProviderRegistry;
  readonly logger: Logger;
  readonly combinationsPerRun: number;
  readonly providerMinIntervalSeconds: number;
  /** Seuils de détection de baisse (config). */
  readonly thresholds: DropThresholds;
  /** Conversion vers la devise de référence (centimes) — injectée par le worker. */
  readonly toBaseCents: (amountCents: number, currency: string) => Promise<number>;
  readonly notificationService: NotificationService;
  /** Re-requête d'un itinéraire pour confirmer un prix (Phase 0 §10). */
  readonly confirm: ConfirmFn;
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
  readonly eventsDetected: number;
  readonly eventsResolved: number;
  readonly alertsTriggered: number;
  readonly alertsSuppressed: number;
  readonly confirmationsFailed: number;
  readonly tier?: string;
  readonly nextIntervalSeconds?: number;
}

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

interface PersistedOffers {
  readonly snapshotInputs: InsertSnapshotInput[];
  readonly offers: { id: string; offer: FlightOffer }[];
}

const persistOffers = async (
  deps: SearchProcessorDeps,
  search: SearchRow,
  combo: SearchDateCombinationRow,
  offers: readonly FlightOffer[],
): Promise<PersistedOffers> => {
  const snapshotInputs: InsertSnapshotInput[] = [];
  const persisted: { id: string; offer: FlightOffer }[] = [];
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
    snapshotInputs.push({
      flightOfferId,
      searchId: search.id,
      provider: offer.provider,
      priceCents: offer.price.amount,
      currency: offer.price.currency,
      priceEurCents: await deps.toBaseCents(offer.price.amount, offer.price.currency),
      availability: offer.availability,
      seatsRemaining: offer.seatsRemaining ?? null,
      observedAt: new Date(offer.observedAt),
    });
    persisted.push({ id: flightOfferId, offer });
  }
  return { snapshotInputs, offers: persisted };
};

const skippedSummary = (
  searchId: string,
  skipped: NonNullable<SearchRunSummary["skipped"]>,
): SearchRunSummary => ({
  searchId,
  skipped,
  combinations: 0,
  offersKept: 0,
  snapshotsInserted: 0,
  bestPriceCents: null,
  providerErrors: 0,
  eventsDetected: 0,
  eventsResolved: 0,
  alertsTriggered: 0,
  alertsSuppressed: 0,
  confirmationsFailed: 0,
});

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
    return skippedSummary(job.searchId, "not_found");
  }

  if (job.reason === "scheduled" && search.status !== "ACTIVE") {
    return skippedSummary(search.id, "not_active");
  }

  deps.logger.info(
    { event: LogEvent.SearchStarted, searchId: search.id, reason: job.reason },
    "recherche démarrée",
  );

  await ensureCombinations(deps, search);
  const picked = await pickCombinations(deps.db, search.id, deps.combinationsPerRun);
  if (picked.length === 0) {
    return skippedSummary(search.id, "no_combinations");
  }

  const searchLike = toSearchLike(search);
  const allSnapshots: InsertSnapshotInput[] = [];
  const offersById = new Map<string, FlightOffer>();
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
    const persisted = await persistOffers(deps, search, combo, normalized.offers);
    allSnapshots.push(...persisted.snapshotInputs);
    for (const { id, offer } of persisted.offers) offersById.set(id, offer);
  }

  const snapshotsInserted = await insertSnapshots(deps.db, allSnapshots);
  await markCombinationsChecked(
    deps.db,
    picked.map((c) => c.id),
    runAt,
  );

  // Passe `analyze` : dérivation + résolution des événements de prix (Phase 4).
  const offerIds = [...new Set(allSnapshots.map((s) => s.flightOfferId))];
  const { eventsDetected, eventsResolved, detected } = await analyzeOffers(
    { db: deps.db, logger: deps.logger, thresholds: deps.thresholds },
    { search, offerIds, now: runAt },
  );

  // Pipeline d'alerte (Phase 5) : cooldown → dédup → confirmation → notification.
  const { alertsTriggered, alertsSuppressed, confirmationsFailed } = await runAlertPipeline(
    {
      db: deps.db,
      logger: deps.logger,
      notificationService: deps.notificationService,
      confirm: deps.confirm,
    },
    { search, detected, offersById, now: runAt },
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
      eventsDetected,
      eventsResolved,
      alertsTriggered,
      alertsSuppressed,
      confirmationsFailed,
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
    eventsDetected,
    eventsResolved,
    alertsTriggered,
    alertsSuppressed,
    confirmationsFailed,
    tier,
    nextIntervalSeconds: intervalSeconds,
  };
};
