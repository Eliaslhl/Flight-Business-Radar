import { and, asc, eq, lte, sql } from "drizzle-orm";
import { type Database } from "../client.js";
import { searches, type NewSearchRow, type SearchRow } from "../schema/core.table.js";

/** Utilisateur unique de développement (seedé par la migration 0001). Auth réelle en Phase 6. */
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

export type CabinClass = SearchRow["cabinClass"];
export type SearchStatus = SearchRow["status"];
export type SearchPriority = SearchRow["priority"];

export interface CreateSearchInput {
  userId?: string;
  label?: string | null;
  origin: string;
  destinations: string[];
  cabinClass: CabinClass;
  departureWindowStart: string;
  departureWindowEnd: string;
  minTripDays: number;
  maxTripDays: number;
  maxPriceCents?: number | null;
  targetPriceCents?: number | null;
  currency?: string;
  maxStops?: number;
  preferredAirlines?: string[];
  excludedAirlines?: string[];
  intervalSeconds?: number;
}

export const createSearch = async (db: Database, input: CreateSearchInput): Promise<SearchRow> => {
  const row: NewSearchRow = {
    userId: input.userId ?? DEV_USER_ID,
    label: input.label ?? null,
    origin: input.origin,
    destinations: input.destinations,
    cabinClass: input.cabinClass,
    departureWindowStart: input.departureWindowStart,
    departureWindowEnd: input.departureWindowEnd,
    minTripDays: input.minTripDays,
    maxTripDays: input.maxTripDays,
    maxPriceCents: input.maxPriceCents ?? null,
    targetPriceCents: input.targetPriceCents ?? null,
    currency: input.currency ?? "EUR",
    maxStops: input.maxStops ?? 1,
    preferredAirlines: input.preferredAirlines ?? [],
    excludedAirlines: input.excludedAirlines ?? [],
    ...(input.intervalSeconds !== undefined ? { intervalSeconds: input.intervalSeconds } : {}),
  };
  const [created] = await db.insert(searches).values(row).returning();
  if (!created) throw new Error("createSearch: aucune ligne retournée");
  return created;
};

export const listSearches = async (
  db: Database,
  filter: { userId?: string } = {},
): Promise<SearchRow[]> => {
  const where = filter.userId ? eq(searches.userId, filter.userId) : undefined;
  return db.select().from(searches).where(where).orderBy(asc(searches.createdAt));
};

export const getSearch = async (db: Database, id: string): Promise<SearchRow | undefined> => {
  const [row] = await db.select().from(searches).where(eq(searches.id, id)).limit(1);
  return row;
};

/** Fixe la priorité manuellement (verrouille le recalcul adaptatif du worker). */
export const setSearchPriority = async (
  db: Database,
  id: string,
  priority: SearchPriority,
): Promise<SearchRow | undefined> => {
  const [row] = await db
    .update(searches)
    .set({ priority, priorityLocked: true })
    .where(eq(searches.id, id))
    .returning();
  return row;
};

export const deleteSearch = async (db: Database, id: string): Promise<boolean> => {
  const deleted = await db
    .delete(searches)
    .where(eq(searches.id, id))
    .returning({ id: searches.id });
  return deleted.length > 0;
};

export const setSearchStatus = async (
  db: Database,
  id: string,
  status: SearchStatus,
): Promise<SearchRow | undefined> => {
  const [row] = await db.update(searches).set({ status }).where(eq(searches.id, id)).returning();
  return row;
};

/**
 * Recherches actives dont l'échéance est atteinte (pour le scheduler).
 * Ordre : priorité (HIGH d'abord) puis `next_run_at` — quand le lot est plafonné,
 * les recherches prioritaires passent en premier.
 */
export const listDueSearches = async (db: Database, now: Date, limit = 50): Promise<SearchRow[]> =>
  db
    .select()
    .from(searches)
    .where(and(eq(searches.status, "ACTIVE"), lte(searches.nextRunAt, now)))
    .orderBy(
      sql`case ${searches.priority} when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end`,
      asc(searches.nextRunAt),
    )
    .limit(limit);

export interface ScheduleUpdate {
  nextRunAt: Date;
  lastRunAt?: Date;
  intervalSeconds?: number;
  priority?: SearchPriority;
}

export const updateSearchSchedule = async (
  db: Database,
  id: string,
  update: ScheduleUpdate,
): Promise<void> => {
  await db
    .update(searches)
    .set({
      nextRunAt: update.nextRunAt,
      ...(update.lastRunAt ? { lastRunAt: update.lastRunAt } : {}),
      ...(update.intervalSeconds !== undefined ? { intervalSeconds: update.intervalSeconds } : {}),
      ...(update.priority ? { priority: update.priority } : {}),
    })
    .where(eq(searches.id, id));
};
