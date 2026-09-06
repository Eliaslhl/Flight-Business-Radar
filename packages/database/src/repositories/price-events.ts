import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { type Database } from "../client.js";
import { priceEvents, type PriceEventRow } from "../schema/core.table.js";

export interface InsertPriceEventInput {
  flightOfferId: string;
  searchId: string | null;
  type: PriceEventRow["type"];
  previousPriceEurCents: number | null;
  newPriceEurCents: number;
  dropAmountEurCents: number | null;
  dropPct: number | null;
  previousSnapshotId: number | null;
  newSnapshotId: number;
  detectedAt?: Date;
}

export const insertPriceEvents = async (
  db: Database,
  inputs: readonly InsertPriceEventInput[],
): Promise<number> => {
  if (inputs.length === 0) return 0;
  const rows = await db
    .insert(priceEvents)
    .values(
      inputs.map((i) => ({
        flightOfferId: i.flightOfferId,
        searchId: i.searchId,
        type: i.type,
        previousPriceEurCents: i.previousPriceEurCents,
        newPriceEurCents: i.newPriceEurCents,
        dropAmountEurCents: i.dropAmountEurCents,
        dropPct: i.dropPct,
        previousSnapshotId: i.previousSnapshotId,
        newSnapshotId: i.newSnapshotId,
        ...(i.detectedAt ? { detectedAt: i.detectedAt } : {}),
      })),
    )
    .returning({ id: priceEvents.id });
  return rows.length;
};

export const listPriceEventsForSearch = async (
  db: Database,
  searchId: string,
  options: { limit?: number; sinceDetectedAt?: Date } = {},
): Promise<PriceEventRow[]> =>
  db
    .select()
    .from(priceEvents)
    .where(
      options.sinceDetectedAt
        ? and(
            eq(priceEvents.searchId, searchId),
            gte(priceEvents.detectedAt, options.sinceDetectedAt),
          )
        : eq(priceEvents.searchId, searchId),
    )
    .orderBy(desc(priceEvents.detectedAt))
    .limit(options.limit ?? 200);

/** Événements de baisse encore « ouverts » (prix pas revenu) pour une offre. */
export const listOpenDropEventsForOffer = async (
  db: Database,
  flightOfferId: string,
): Promise<PriceEventRow[]> =>
  db
    .select()
    .from(priceEvents)
    .where(
      and(
        eq(priceEvents.flightOfferId, flightOfferId),
        isNull(priceEvents.resolvedAt),
        inArray(priceEvents.type, ["DROP", "FLASH_DROP"]),
      ),
    );

export const resolvePriceEvents = async (
  db: Database,
  ids: readonly string[],
  resolvedAt: Date,
): Promise<void> => {
  if (ids.length === 0) return;
  await db
    .update(priceEvents)
    .set({
      resolvedAt,
      durationSeconds: sql`extract(epoch from (${resolvedAt.toISOString()}::timestamptz - ${priceEvents.detectedAt}))::int`,
    })
    .where(inArray(priceEvents.id, [...ids]));
};

export const countPriceEventsForSearch = async (
  db: Database,
  searchId: string,
): Promise<number> => {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(priceEvents)
    .where(eq(priceEvents.searchId, searchId));
  return row?.n ?? 0;
};
