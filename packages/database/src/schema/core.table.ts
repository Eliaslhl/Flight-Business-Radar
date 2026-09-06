import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/*
 * Schéma métier — Phase 3 (moteur de recherche).
 * NB : ce fichier ne doit rien importer d'un autre fichier de schéma
 * (drizzle-kit charge chaque `*.table.ts` isolément).
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export const cabinClassEnum = pgEnum("cabin_class", [
  "ECONOMY",
  "PREMIUM_ECONOMY",
  "BUSINESS",
  "FIRST",
]);
export const searchStatusEnum = pgEnum("search_status", ["ACTIVE", "PAUSED", "ARCHIVED"]);
export const searchPriorityEnum = pgEnum("search_priority", ["HIGH", "MEDIUM", "LOW"]);
export const availabilityEnum = pgEnum("availability", ["AVAILABLE", "LOW", "WAITLIST", "UNKNOWN"]);
export const snapshotStatusEnum = pgEnum("snapshot_status", [
  "OBSERVED",
  "CONFIRMED",
  "EXPIRED",
  "REJECTED",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const emptyTextArray = sql`ARRAY[]::text[]`;

// ─── users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  preferredCurrency: varchar("preferred_currency", { length: 3 }).notNull().default("EUR"),
  timezone: text("timezone").notNull().default("Europe/Paris"),
  ...timestamps,
});

// ─── searches ────────────────────────────────────────────────────────────────

export const searches = pgTable(
  "searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label"),

    origin: varchar("origin", { length: 3 }).notNull(),
    // Liste vide ⇒ mode Radar (Phase 9).
    destinations: text("destinations").array().notNull().default(emptyTextArray),
    cabinClass: cabinClassEnum("cabin_class").notNull().default("BUSINESS"),

    departureWindowStart: date("departure_window_start").notNull(),
    departureWindowEnd: date("departure_window_end").notNull(),
    minTripDays: integer("min_trip_days").notNull(),
    maxTripDays: integer("max_trip_days").notNull(),

    maxPriceCents: integer("max_price_cents"),
    targetPriceCents: integer("target_price_cents"),
    currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
    maxStops: integer("max_stops").notNull().default(1),

    preferredAirlines: text("preferred_airlines").array().notNull().default(emptyTextArray),
    excludedAirlines: text("excluded_airlines").array().notNull().default(emptyTextArray),

    status: searchStatusEnum("status").notNull().default("ACTIVE"),
    priority: searchPriorityEnum("priority").notNull().default("MEDIUM"),

    // Surveillance adaptative (Phase 0 §8) — valeurs pilotées par le scheduler.
    intervalSeconds: integer("interval_seconds").notNull().default(1800),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),

    ...timestamps,
  },
  (t) => [index("searches_due_idx").on(t.status, t.nextRunAt)],
);

// ─── search_date_combinations ────────────────────────────────────────────────

export const searchDateCombinations = pgTable(
  "search_date_combinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    searchId: uuid("search_id")
      .notNull()
      .references(() => searches.id, { onDelete: "cascade" }),
    outboundDate: date("outbound_date").notNull(),
    returnDate: date("return_date"),
    tripDays: integer("trip_days"),
    priorityScore: doublePrecision("priority_score").notNull().default(0),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("search_date_combinations_unique").on(t.searchId, t.outboundDate, t.returnDate),
    index("search_date_combinations_pick_idx").on(t.searchId, t.enabled, t.priorityScore),
  ],
);

// ─── flight_offers ───────────────────────────────────────────────────────────
// Colonnes d'identité/requête + payload JSON complet (fidélité totale).

export const flightOffers = pgTable(
  "flight_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fingerprint: text("fingerprint").notNull().unique(),

    origin: varchar("origin", { length: 3 }).notNull(),
    destination: varchar("destination", { length: 3 }).notNull(),
    cabinClass: cabinClassEnum("cabin_class").notNull(),
    outboundDate: date("outbound_date").notNull(),
    returnDate: date("return_date"),
    tripDays: integer("trip_days"),
    marketingAirline: varchar("marketing_airline", { length: 3 }),
    maxStops: integer("max_stops").notNull().default(0),

    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("flight_offers_route_idx").on(t.origin, t.destination, t.outboundDate)],
);

// ─── offer_provider_links ────────────────────────────────────────────────────

export const offerProviderLinks = pgTable(
  "offer_provider_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flightOfferId: uuid("flight_offer_id")
      .notNull()
      .references(() => flightOffers.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerOfferId: text("provider_offer_id"),
    bookingUrl: text("booking_url"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("offer_provider_links_unique").on(t.flightOfferId, t.provider)],
);

// ─── price_snapshots (APPEND ONLY) ──────────────────────────────────────────
// Jamais d'UPDATE/DELETE en fonctionnement normal. `price_eur_cents` est
// alimenté par le worker via `@fbr/fx`. Partitionnement mensuel : différé
// (optimisation, invisible via Drizzle) — cf. docs/DATABASE.md.

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    flightOfferId: uuid("flight_offer_id")
      .notNull()
      .references(() => flightOffers.id, { onDelete: "cascade" }),
    searchId: uuid("search_id").references(() => searches.id, { onDelete: "set null" }),
    provider: text("provider").notNull(),
    priceCents: integer("price_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    priceEurCents: integer("price_eur_cents"),
    availability: availabilityEnum("availability").notNull().default("UNKNOWN"),
    seatsRemaining: integer("seats_remaining"),
    status: snapshotStatusEnum("status").notNull().default("OBSERVED"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("price_snapshots_offer_observed_idx").on(t.flightOfferId, t.observedAt),
    index("price_snapshots_search_observed_idx").on(t.searchId, t.observedAt),
  ],
);

// ─── price_events (dérivés — Phase 4) ──────────────────────────────────────

export const priceEventTypeEnum = pgEnum("price_event_type", [
  "DROP",
  "FLASH_DROP",
  "RISE",
  "RECORD_LOW",
  "RECORD_HIGH",
  "TARGET_HIT",
  "UNUSUAL",
]);

export const priceEvents = pgTable(
  "price_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    flightOfferId: uuid("flight_offer_id")
      .notNull()
      .references(() => flightOffers.id, { onDelete: "cascade" }),
    searchId: uuid("search_id").references(() => searches.id, { onDelete: "set null" }),
    type: priceEventTypeEnum("type").notNull(),
    previousPriceEurCents: integer("previous_price_eur_cents"),
    newPriceEurCents: integer("new_price_eur_cents").notNull(),
    dropAmountEurCents: integer("drop_amount_eur_cents"),
    dropPct: doublePrecision("drop_pct"),
    previousSnapshotId: bigint("previous_snapshot_id", { mode: "number" }),
    newSnapshotId: bigint("new_snapshot_id", { mode: "number" }).notNull(),
    confirmed: boolean("confirmed").notNull().default(false),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    /** Renseigné quand le prix est revenu au-dessus du niveau de l'événement. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
  },
  (t) => [
    index("price_events_search_detected_idx").on(t.searchId, t.detectedAt),
    index("price_events_offer_detected_idx").on(t.flightOfferId, t.detectedAt),
    index("price_events_open_idx")
      .on(t.flightOfferId, t.type)
      .where(sql`${t.resolvedAt} is null`),
  ],
);

// ─── fx_rates (cache des taux de change — Phase 4) ─────────────────────────

export const fxRates = pgTable(
  "fx_rates",
  {
    base: varchar("base", { length: 3 }).notNull(),
    quote: varchar("quote", { length: 3 }).notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    asOf: date("as_of").notNull(),
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.base, t.quote, t.asOf] })],
);

// ─── alerts + notifications (Phase 5) ─────────────────────────────────────

export const alertTypeEnum = pgEnum("alert_type", [
  "TARGET_PRICE",
  "PRICE_DROP",
  "FLASH_DROP",
  "RECORD_LOW",
  "UNUSUAL_PRICE",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "CONSOLE",
  "EMAIL",
  "TELEGRAM",
  "DISCORD",
  "PUSH",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "PENDING",
  "SENT",
  "FAILED",
  "SUPPRESSED",
]);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    searchId: uuid("search_id")
      .notNull()
      .references(() => searches.id, { onDelete: "cascade" }),
    type: alertTypeEnum("type").notNull(),
    /** Plafond de prix (centimes EUR) pour TARGET_PRICE / RECORD_LOW. */
    thresholdEurCents: integer("threshold_eur_cents"),
    enabled: boolean("enabled").notNull().default(true),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(3600),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("alerts_search_enabled_idx").on(t.searchId, t.enabled)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    searchId: uuid("search_id").references(() => searches.id, { onDelete: "set null" }),
    alertId: uuid("alert_id").references(() => alerts.id, { onDelete: "set null" }),
    priceEventId: uuid("price_event_id").references(() => priceEvents.id, { onDelete: "set null" }),
    channel: notificationChannelEnum("channel").notNull(),
    status: notificationStatusEnum("status").notNull().default("PENDING"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    /** Idempotence anti-spam (une par recherche / type / route / jour). */
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_channel_idx").on(t.dedupeKey, t.channel),
    index("notifications_search_created_idx").on(t.searchId, t.createdAt),
  ],
);

// ─── relations (pour les requêtes typées `db.query`) ────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  searches: many(searches),
  alerts: many(alerts),
  notifications: many(notifications),
}));

export const searchesRelations = relations(searches, ({ one, many }) => ({
  user: one(users, { fields: [searches.userId], references: [users.id] }),
  dateCombinations: many(searchDateCombinations),
  snapshots: many(priceSnapshots),
  alerts: many(alerts),
  notifications: many(notifications),
}));

export const alertsRelations = relations(alerts, ({ one, many }) => ({
  user: one(users, { fields: [alerts.userId], references: [users.id] }),
  search: one(searches, { fields: [alerts.searchId], references: [searches.id] }),
  notifications: many(notifications),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  search: one(searches, { fields: [notifications.searchId], references: [searches.id] }),
  alert: one(alerts, { fields: [notifications.alertId], references: [alerts.id] }),
  priceEvent: one(priceEvents, {
    fields: [notifications.priceEventId],
    references: [priceEvents.id],
  }),
}));

export const searchDateCombinationsRelations = relations(searchDateCombinations, ({ one }) => ({
  search: one(searches, {
    fields: [searchDateCombinations.searchId],
    references: [searches.id],
  }),
}));

export const flightOffersRelations = relations(flightOffers, ({ many }) => ({
  providerLinks: many(offerProviderLinks),
  snapshots: many(priceSnapshots),
  events: many(priceEvents),
}));

export const priceEventsRelations = relations(priceEvents, ({ one }) => ({
  offer: one(flightOffers, {
    fields: [priceEvents.flightOfferId],
    references: [flightOffers.id],
  }),
  search: one(searches, { fields: [priceEvents.searchId], references: [searches.id] }),
}));

export const priceSnapshotsRelations = relations(priceSnapshots, ({ one }) => ({
  offer: one(flightOffers, {
    fields: [priceSnapshots.flightOfferId],
    references: [flightOffers.id],
  }),
  search: one(searches, { fields: [priceSnapshots.searchId], references: [searches.id] }),
}));

// ─── types ──────────────────────────────────────────────────────────────────

export type UserRow = typeof users.$inferSelect;
export type SearchRow = typeof searches.$inferSelect;
export type NewSearchRow = typeof searches.$inferInsert;
export type SearchDateCombinationRow = typeof searchDateCombinations.$inferSelect;
export type FlightOfferRow = typeof flightOffers.$inferSelect;
export type NewFlightOfferRow = typeof flightOffers.$inferInsert;
export type PriceSnapshotRow = typeof priceSnapshots.$inferSelect;
export type NewPriceSnapshotRow = typeof priceSnapshots.$inferInsert;
export type PriceEventRow = typeof priceEvents.$inferSelect;
export type NewPriceEventRow = typeof priceEvents.$inferInsert;
export type FxRateRow = typeof fxRates.$inferSelect;
export type AlertRow = typeof alerts.$inferSelect;
export type NewAlertRow = typeof alerts.$inferInsert;
export type NotificationRow = typeof notifications.$inferSelect;
export type NewNotificationRow = typeof notifications.$inferInsert;
