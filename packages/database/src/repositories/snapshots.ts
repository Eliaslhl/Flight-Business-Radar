import { and, desc, eq, sql } from "drizzle-orm";
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
