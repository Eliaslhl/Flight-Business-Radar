import { derivePriceEvents, type DropThresholds } from "@fbr/analytics";
import {
  getOfferPriceAggregate,
  getRecentSnapshotsForOffer,
  insertPriceEvents,
  listOpenDropEventsForOffer,
  resolvePriceEvents,
  type Database,
  type SearchRow,
} from "@fbr/database";
import { LogEvent, type Logger } from "@fbr/shared";

export interface AnalyzerDeps {
  readonly db: Database;
  readonly logger: Logger;
  readonly thresholds: DropThresholds;
}

export interface AnalyzeResult {
  readonly eventsDetected: number;
  readonly eventsResolved: number;
}

/** Tolérance de « retour au prix » pour clore une baisse ouverte (3 %). */
const RECOVERY_TOLERANCE = 0.03;

/**
 * Passe `analyze` (Phase 0 §9) exécutée après l'écriture des snapshots : pour
 * chaque offre touchée, compare le dernier prix au précédent + à l'historique
 * agrégé, persiste les `price_events` candidats, et résout les baisses dont le
 * prix est revenu. La confirmation + les notifications sont en Phase 5.
 */
export const analyzeOffers = async (
  deps: AnalyzerDeps,
  params: { search: SearchRow; offerIds: readonly string[]; now: Date },
): Promise<AnalyzeResult> => {
  const targetEurCents = params.search.targetPriceCents ?? undefined; // search.currency == EUR (Phase 4)
  let eventsDetected = 0;
  let eventsResolved = 0;

  for (const offerId of params.offerIds) {
    const recent = await getRecentSnapshotsForOffer(deps.db, offerId, 2);
    const current = recent[0];
    if (current?.priceEurCents == null) continue;
    const currentEurCents = current.priceEurCents;
    const previous = recent[1];
    const previousRef =
      previous?.priceEurCents == null
        ? null
        : {
            id: previous.id,
            priceEurCents: previous.priceEurCents,
            observedAt: previous.observedAt.toISOString(),
          };

    const before = await getOfferPriceAggregate(deps.db, offerId, { beforeSnapshotId: current.id });

    const derived = derivePriceEvents(
      {
        current: {
          id: current.id,
          priceEurCents: currentEurCents,
          observedAt: current.observedAt.toISOString(),
        },
        previous: previousRef,
        ...(before.minEurCents !== null ? { minEverEurCents: before.minEurCents } : {}),
        ...(before.maxEurCents !== null ? { maxEverEurCents: before.maxEurCents } : {}),
        ...(before.p10EurCents !== null ? { p10EurCents: before.p10EurCents } : {}),
        ...(targetEurCents !== undefined ? { targetEurCents } : {}),
        observationCount: before.count + 1,
      },
      deps.thresholds,
    );

    if (derived.length > 0) {
      await insertPriceEvents(
        deps.db,
        derived.map((e) => ({
          flightOfferId: offerId,
          searchId: params.search.id,
          type: e.type,
          previousPriceEurCents: e.previousPriceEurCents,
          newPriceEurCents: e.newPriceEurCents,
          dropAmountEurCents: e.dropAmountEurCents,
          dropPct: e.dropPct,
          previousSnapshotId: e.previousSnapshotId,
          newSnapshotId: e.newSnapshotId,
          detectedAt: params.now,
        })),
      );
      eventsDetected += derived.length;
      for (const e of derived) {
        deps.logger.info(
          {
            event:
              e.type === "FLASH_DROP" ? LogEvent.FlashDropDetected : LogEvent.PriceDropDetected,
            searchId: params.search.id,
            flightOfferId: offerId,
            type: e.type,
            newPriceEurCents: e.newPriceEurCents,
            dropPct: e.dropPct,
          },
          "événement de prix détecté",
        );
      }
    }

    const open = await listOpenDropEventsForOffer(deps.db, offerId);
    const recovered = open.filter(
      (ev) => currentEurCents > ev.newPriceEurCents * (1 + RECOVERY_TOLERANCE),
    );
    if (recovered.length > 0) {
      await resolvePriceEvents(
        deps.db,
        recovered.map((r) => r.id),
        params.now,
      );
      eventsResolved += recovered.length;
    }
  }

  return { eventsDetected, eventsResolved };
};
