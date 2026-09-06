import { and, asc, eq } from "drizzle-orm";
import { type Database } from "../client.js";
import { alerts, type AlertRow, type NewAlertRow } from "../schema/core.table.js";
import { DEV_USER_ID } from "./searches.js";

export type AlertType = AlertRow["type"];

export interface CreateAlertInput {
  userId?: string;
  searchId: string;
  type: AlertType;
  thresholdEurCents?: number | null;
  enabled?: boolean;
  cooldownSeconds?: number;
}

export const createAlert = async (db: Database, input: CreateAlertInput): Promise<AlertRow> => {
  const row: NewAlertRow = {
    userId: input.userId ?? DEV_USER_ID,
    searchId: input.searchId,
    type: input.type,
    thresholdEurCents: input.thresholdEurCents ?? null,
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.cooldownSeconds !== undefined ? { cooldownSeconds: input.cooldownSeconds } : {}),
  };
  const [created] = await db.insert(alerts).values(row).returning();
  if (!created) throw new Error("createAlert: aucune ligne retournée");
  return created;
};

export const listAlerts = async (
  db: Database,
  filter: { userId?: string; searchId?: string } = {},
): Promise<AlertRow[]> => {
  const clauses = [
    filter.userId ? eq(alerts.userId, filter.userId) : undefined,
    filter.searchId ? eq(alerts.searchId, filter.searchId) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  return db
    .select()
    .from(alerts)
    .where(clauses.length > 0 ? and(...clauses) : undefined)
    .orderBy(asc(alerts.createdAt));
};

export const getAlert = async (db: Database, id: string): Promise<AlertRow | undefined> => {
  const [row] = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
  return row;
};

export const deleteAlert = async (db: Database, id: string): Promise<boolean> => {
  const deleted = await db.delete(alerts).where(eq(alerts.id, id)).returning({ id: alerts.id });
  return deleted.length > 0;
};

export const setAlertEnabled = async (
  db: Database,
  id: string,
  enabled: boolean,
): Promise<AlertRow | undefined> => {
  const [row] = await db.update(alerts).set({ enabled }).where(eq(alerts.id, id)).returning();
  return row;
};

/** Alertes activées d'une recherche (pour le pipeline d'alerte du worker). */
export const listEnabledAlertsForSearch = async (
  db: Database,
  searchId: string,
): Promise<AlertRow[]> =>
  db
    .select()
    .from(alerts)
    .where(and(eq(alerts.searchId, searchId), eq(alerts.enabled, true)));

export const markAlertTriggered = async (db: Database, id: string, at: Date): Promise<void> => {
  await db.update(alerts).set({ lastTriggeredAt: at }).where(eq(alerts.id, id));
};
