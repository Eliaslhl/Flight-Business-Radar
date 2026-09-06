import { desc, eq, sql } from "drizzle-orm";
import { type Database } from "../client.js";
import { notifications, type NotificationRow } from "../schema/core.table.js";
import { DEV_USER_ID } from "./searches.js";

export interface InsertNotificationInput {
  userId?: string;
  searchId: string | null;
  alertId: string | null;
  priceEventId: string | null;
  channel: NotificationRow["channel"];
  status: NotificationRow["status"];
  subject: string;
  body: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
  sentAt?: Date | null;
  error?: string | null;
}

export const insertNotification = async (
  db: Database,
  input: InsertNotificationInput,
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: input.userId ?? DEV_USER_ID,
      searchId: input.searchId,
      alertId: input.alertId,
      priceEventId: input.priceEventId,
      channel: input.channel,
      status: input.status,
      subject: input.subject,
      body: input.body,
      payload: input.payload,
      dedupeKey: input.dedupeKey,
      sentAt: input.sentAt ?? null,
      error: input.error ?? null,
    })
    .returning({ id: notifications.id });
  if (!row) throw new Error("insertNotification: aucune ligne retournée");
  return row;
};

/** `true` si une notification a déjà été enregistrée pour cette clé d'idempotence. */
export const notificationExists = async (db: Database, dedupeKey: string): Promise<boolean> => {
  const [row] = await db
    .select({ n: sql<number>`1` })
    .from(notifications)
    .where(eq(notifications.dedupeKey, dedupeKey))
    .limit(1);
  return row !== undefined;
};

export const listNotificationsForSearch = async (
  db: Database,
  searchId: string,
  options: { limit?: number } = {},
): Promise<NotificationRow[]> =>
  db
    .select()
    .from(notifications)
    .where(eq(notifications.searchId, searchId))
    .orderBy(desc(notifications.createdAt))
    .limit(options.limit ?? 200);

export const countNotificationsForSearch = async (
  db: Database,
  searchId: string,
): Promise<number> => {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.searchId, searchId));
  return row?.n ?? 0;
};
