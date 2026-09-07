import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { type Database } from "../client.js";
import {
  flightOffers,
  priceSnapshots,
  type FlightOfferRow,
  type PriceSnapshotRow,
} from "../schema/core.table.js";

export interface InsertSnapshotInput {
  flightOfferId: string;
  searchId: string | null;
  provider: string;
  priceCents: number;
  currency: string;
  priceEurCents?: number | null;
  availability: PriceSnapshotRow["availability"];
  seatsRemaining?: number | null;
  status?: PriceSnapshotRow["status"];
  observedAt?: Date;
}

const toValues = (input: InsertSnapshotInput) => ({
  flightOfferId: input.flightOfferId,
  searchId: input.searchId,
  provider: input.provider,
  priceCents: input.priceCents,
  currency: input.currency,
  priceEurCents: input.priceEurCents ?? null,
  availability: input.availability,
  seatsRemaining: input.seatsRemaining ?? null,
  ...(input.status ? { status: input.status } : {}),
  ...(input.observedAt ? { observedAt: input.observedAt } : {}),
});

/** Ajoute un snapshot. La table est **append-only** : jamais d'UPDATE/DELETE ici. */
export const insertSnapshot = async (
  db: Database,
  input: InsertSnapshotInput,
): Promise<{ id: number }> => {
  const [row] = await db.insert(priceSnapshots).values(toValues(input)).returning({
    id: priceSnapshots.id,
  });
  if (!row) throw new Error("insertSnapshot: aucune ligne retournée");
  return row;
};

export const insertSnapshots = async (
  db: Database,
  inputs: readonly InsertSnapshotInput[],
): Promise<number> => {
  if (inputs.length === 0) return 0;
  const rows = await db
    .insert(priceSnapshots)
    .values(inputs.map(toValues))
    .returning({ id: priceSnapshots.id });
  return rows.length;
};

/**
 * Écarte les snapshots dont le couple `(flight_offer_id, observed_at)` est déjà
 * en base — indispensable pour les providers à **données en cache**
 * (Travelpayouts) qui renvoient les mêmes lignes horodatées à chaque sondage.
 * Sans effet pour les providers qui horodatent à « maintenant » (jamais de
 * collision).
 */
export const dedupeAgainstExistingSnapshots = async (
  db: Database,
  inputs: readonly InsertSnapshotInput[],
): Promise<InsertSnapshotInput[]> => {
  const withDate = inputs.filter((i) => i.observedAt instanceof Date);
  if (withDate.length === 0) return [...inputs];

  const offerIds = [...new Set(withDate.map((i) => i.flightOfferId))];
  const since = new Date(Math.min(...withDate.map((i) => i.observedAt!.getTime())));

  const existing = await db
    .select({
      flightOfferId: priceSnapshots.flightOfferId,
      observedAt: priceSnapshots.observedAt,
    })
    .from(priceSnapshots)
    .where(
      and(inArray(priceSnapshots.flightOfferId, offerIds), gte(priceSnapshots.observedAt, since)),
    );

  const seen = new Set(existing.map((r) => `${r.flightOfferId}|${r.observedAt.toISOString()}`));
  return inputs.filter(
    (i) =>
      !(i.observedAt instanceof Date) ||
      !seen.has(`${i.flightOfferId}|${i.observedAt.toISOString()}`),
  );
};

/**
 * Purge de rétention : supprime les snapshots dont `observed_at` est antérieur à
 * `now - retentionDays`. Opération de maintenance délibérée (la table reste
 * append-only en écriture applicative) — lancée par le runner one-shot
 * `@fbr/worker/once` pour tenir dans un Postgres gratuit. `retentionDays <= 0`
 * ⇒ no-op. Retourne le nombre de lignes supprimées.
 */
export const pruneOldSnapshots = async (
  db: Database,
  retentionDays: number,
  now: Date = new Date(),
): Promise<number> => {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const deleted = await db
    .delete(priceSnapshots)
    .where(lt(priceSnapshots.observedAt, cutoff))
    .returning({ id: priceSnapshots.id });
  return deleted.length;
};

export const listSnapshotsForSearch = async (
  db: Database,
  searchId: string,
  options: { limit?: number } = {},
): Promise<PriceSnapshotRow[]> =>
  db
    .select()
    .from(priceSnapshots)
    .where(eq(priceSnapshots.searchId, searchId))
    .orderBy(desc(priceSnapshots.observedAt))
    .limit(options.limit ?? 500);

/**
 * Met à jour le **statut** d'un snapshot (OBSERVED → CONFIRMED / EXPIRED).
 * Le **prix** n'est jamais modifié — la table reste append-only.
 */
export const updateSnapshotStatus = async (
  db: Database,
  id: number,
  status: PriceSnapshotRow["status"],
): Promise<void> => {
  await db.update(priceSnapshots).set({ status }).where(eq(priceSnapshots.id, id));
};

export const countSnapshotsForSearch = async (db: Database, searchId: string): Promise<number> => {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(priceSnapshots)
    .where(eq(priceSnapshots.searchId, searchId));
  return row?.n ?? 0;
};

export interface SearchFlightRow {
  offer: FlightOfferRow;
  latestPriceCents: number;
  currency: string;
  availability: PriceSnapshotRow["availability"];
  observedAt: Date;
}

/**
 * Dernière observation par offre pour une recherche (pour l'endpoint `/flights`).
 * `DISTINCT ON (flight_offer_id)` + tri par `observed_at` décroissant.
 */
export const listSearchFlights = async (
  db: Database,
  searchId: string,
  options: { limit?: number } = {},
): Promise<SearchFlightRow[]> => {
  const latest = db
    .selectDistinctOn([priceSnapshots.flightOfferId], {
      flightOfferId: priceSnapshots.flightOfferId,
      priceCents: priceSnapshots.priceCents,
      currency: priceSnapshots.currency,
      availability: priceSnapshots.availability,
      observedAt: priceSnapshots.observedAt,
    })
    .from(priceSnapshots)
    .where(eq(priceSnapshots.searchId, searchId))
    .orderBy(priceSnapshots.flightOfferId, desc(priceSnapshots.observedAt))
    .as("latest");

  const rows = await db
    .select({
      offer: flightOffers,
      latestPriceCents: latest.priceCents,
      currency: latest.currency,
      availability: latest.availability,
      observedAt: latest.observedAt,
    })
    .from(latest)
    .innerJoin(flightOffers, eq(flightOffers.id, latest.flightOfferId))
    .orderBy(latest.priceCents)
    .limit(options.limit ?? 200);

  return rows;
};

export const getOfferPriceHistory = async (
  db: Database,
  fingerprint: string,
  options: { limit?: number } = {},
): Promise<PriceSnapshotRow[]> =>
  db
    .select({ snapshot: priceSnapshots })
    .from(priceSnapshots)
    .innerJoin(flightOffers, eq(flightOffers.id, priceSnapshots.flightOfferId))
    .where(and(eq(flightOffers.fingerprint, fingerprint)))
    .orderBy(desc(priceSnapshots.observedAt))
    .limit(options.limit ?? 500)
    .then((rows) => rows.map((r) => r.snapshot));

/** Les `limit` snapshots les plus récents d'une offre (pour la dérivation d'événements). */
export const getRecentSnapshotsForOffer = async (
  db: Database,
  flightOfferId: string,
  limit = 2,
): Promise<PriceSnapshotRow[]> =>
  db
    .select()
    .from(priceSnapshots)
    .where(eq(priceSnapshots.flightOfferId, flightOfferId))
    .orderBy(desc(priceSnapshots.observedAt), desc(priceSnapshots.id))
    .limit(limit);

export interface OfferPriceAggregate {
  count: number;
  minEurCents: number | null;
  maxEurCents: number | null;
  p10EurCents: number | null;
}

/** Agrégats historiques d'une offre sur `price_eur_cents` (normalisé). */
export const getOfferPriceAggregate = async (
  db: Database,
  flightOfferId: string,
  options: { beforeSnapshotId?: number } = {},
): Promise<OfferPriceAggregate> => {
  const where =
    options.beforeSnapshotId !== undefined
      ? and(
          eq(priceSnapshots.flightOfferId, flightOfferId),
          lt(priceSnapshots.id, options.beforeSnapshotId),
        )
      : eq(priceSnapshots.flightOfferId, flightOfferId);
  const [row] = await db
    .select({
      count: sql<number>`count(${priceSnapshots.priceEurCents})::int`,
      minEurCents: sql<number | null>`min(${priceSnapshots.priceEurCents})`,
      maxEurCents: sql<number | null>`max(${priceSnapshots.priceEurCents})`,
      p10EurCents: sql<
        number | null
      >`percentile_cont(0.1) within group (order by ${priceSnapshots.priceEurCents})`,
    })
    .from(priceSnapshots)
    .where(where);
  return {
    count: row?.count ?? 0,
    minEurCents: row?.minEurCents ?? null,
    maxEurCents: row?.maxEurCents ?? null,
    p10EurCents:
      row?.p10EurCents === null || row?.p10EurCents === undefined
        ? null
        : Math.round(row.p10EurCents),
  };
};

export interface AnalyticsObservation {
  priceEurCents: number;
  observedAt: Date;
  origin: string;
  destination: string;
  outboundDate: string;
  returnDate: string | null;
  tripDays: number | null;
  marketingAirline: string | null;
  maxStops: number;
}

/** Observations enrichies (snapshot + offre) pour le moteur d'analyse d'une recherche. */
export const listObservationsForAnalytics = async (
  db: Database,
  searchId: string,
  options: { limit?: number } = {},
): Promise<AnalyticsObservation[]> => {
  const rows = await db
    .select({
      priceEurCents: priceSnapshots.priceEurCents,
      observedAt: priceSnapshots.observedAt,
      origin: flightOffers.origin,
      destination: flightOffers.destination,
      outboundDate: flightOffers.outboundDate,
      returnDate: flightOffers.returnDate,
      tripDays: flightOffers.tripDays,
      marketingAirline: flightOffers.marketingAirline,
      maxStops: flightOffers.maxStops,
    })
    .from(priceSnapshots)
    .innerJoin(flightOffers, eq(flightOffers.id, priceSnapshots.flightOfferId))
    .where(and(eq(priceSnapshots.searchId, searchId), isNotNull(priceSnapshots.priceEurCents)))
    .orderBy(priceSnapshots.observedAt)
    .limit(options.limit ?? 20_000);

  return rows.map((r) => ({
    priceEurCents: r.priceEurCents ?? 0,
    observedAt: r.observedAt,
    origin: r.origin,
    destination: r.destination,
    outboundDate: r.outboundDate,
    returnDate: r.returnDate,
    tripDays: r.tripDays,
    marketingAirline: r.marketingAirline,
    maxStops: r.maxStops,
  }));
};
