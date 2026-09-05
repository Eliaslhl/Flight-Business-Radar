import { sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Table technique clé/valeur. Sert de cible de bout-en-bout à la Phase 1
 * (vérifier connexion + migrations + client typé). Les tables métier
 * (`users`, `searches`, `flight_offers`, `price_snapshots`…) sont ajoutées
 * dans leurs phases respectives (3 à 5).
 */
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type AppMetaRow = typeof appMeta.$inferSelect;
export type NewAppMetaRow = typeof appMeta.$inferInsert;
