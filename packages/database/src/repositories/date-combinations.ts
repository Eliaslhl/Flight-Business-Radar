import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { type Database } from "../client.js";
import { searchDateCombinations, type SearchDateCombinationRow } from "../schema/core.table.js";

export interface CombinationInput {
  outboundDate: string;
  returnDate: string | null;
  tripDays: number | null;
  priorityScore: number;
}

/** Remplace l'ensemble des combinaisons d'une recherche (dedup géré par la contrainte unique). */
export const replaceCombinations = async (
  db: Database,
  searchId: string,
  combos: readonly CombinationInput[],
): Promise<void> => {
  await db.transaction(async (tx): Promise<void> => {
    await tx.delete(searchDateCombinations).where(eq(searchDateCombinations.searchId, searchId));
    if (combos.length === 0) return;
    await tx.insert(searchDateCombinations).values(
      combos.map((c) => ({
        searchId,
        outboundDate: c.outboundDate,
        returnDate: c.returnDate,
        tripDays: c.tripDays,
        priorityScore: c.priorityScore,
      })),
    );
  });
};

export const countCombinations = async (db: Database, searchId: string): Promise<number> => {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(searchDateCombinations)
    .where(eq(searchDateCombinations.searchId, searchId));
  return row?.n ?? 0;
};

export const listCombinations = async (
  db: Database,
  searchId: string,
): Promise<SearchDateCombinationRow[]> =>
  db
    .select()
    .from(searchDateCombinations)
    .where(eq(searchDateCombinations.searchId, searchId))
    .orderBy(desc(searchDateCombinations.priorityScore));

/**
 * Sélectionne les `limit` combinaisons à sonder ce cycle : activées, les jamais
 * vérifiées d'abord, puis par score de priorité décroissant (Phase 0 §6).
 */
export const pickCombinations = async (
  db: Database,
  searchId: string,
  limit: number,
): Promise<SearchDateCombinationRow[]> =>
  db
    .select()
    .from(searchDateCombinations)
    .where(
      and(eq(searchDateCombinations.searchId, searchId), eq(searchDateCombinations.enabled, true)),
    )
    .orderBy(
      sql`${searchDateCombinations.lastCheckedAt} asc nulls first`,
      desc(searchDateCombinations.priorityScore),
    )
    .limit(limit);

export const markCombinationsChecked = async (
  db: Database,
  ids: readonly string[],
  at: Date,
): Promise<void> => {
  if (ids.length === 0) return;
  await db
    .update(searchDateCombinations)
    .set({ lastCheckedAt: at })
    .where(inArray(searchDateCombinations.id, [...ids]));
};
