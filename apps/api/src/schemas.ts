import { ALERT_TYPES } from "@fbr/alerting";
import {
  airlineCodeSchema,
  airportCodeSchema,
  cabinClassSchema,
  compareIsoDate,
  isoDateSchema,
} from "@fbr/flight-domain";
import { z } from "zod";

const currency = z.string().regex(/^[A-Z]{3}$/, "code devise ISO 4217");

/** Corps de `POST /api/searches`. Les prix sont en **centimes entiers**. */
export const createSearchBodySchema = z
  .object({
    label: z.string().min(1).max(120).optional(),
    origin: airportCodeSchema,
    destinations: z.array(airportCodeSchema).default([]),
    cabinClass: cabinClassSchema.default("BUSINESS"),
    departureWindow: z.object({ start: isoDateSchema, end: isoDateSchema }),
    tripDuration: z.object({
      minDays: z.number().int().positive(),
      maxDays: z.number().int().positive(),
    }),
    maxStops: z.number().int().nonnegative().max(4).default(1),
    maxPriceCents: z.number().int().positive().optional(),
    targetPriceCents: z.number().int().positive().optional(),
    currency: currency.default("EUR"),
    preferredAirlines: z.array(airlineCodeSchema).default([]),
    excludedAirlines: z.array(airlineCodeSchema).default([]),
    intervalSeconds: z.number().int().positive().max(86_400).optional(),
  })
  .refine((b) => compareIsoDate(b.departureWindow.start, b.departureWindow.end) <= 0, {
    message: "departureWindow.start doit précéder ou égaler end",
    path: ["departureWindow"],
  })
  .refine((b) => b.tripDuration.minDays <= b.tripDuration.maxDays, {
    message: "tripDuration.minDays doit être <= maxDays",
    path: ["tripDuration"],
  })
  .refine(
    (b) =>
      b.maxPriceCents === undefined ||
      b.targetPriceCents === undefined ||
      b.targetPriceCents <= b.maxPriceCents,
    { message: "targetPriceCents doit être <= maxPriceCents", path: ["targetPriceCents"] },
  );

export type CreateSearchBody = z.infer<typeof createSearchBodySchema>;

/**
 * Corps de `PATCH /api/searches/:id` — tous les champs optionnels. `null`
 * explicite efface une cible / un budget. Un changement de dates, durée,
 * origine ou destinations regénère les combinaisons.
 */
export const updateSearchBodySchema = z
  .object({
    label: z.string().min(1).max(120).nullable(),
    origin: airportCodeSchema,
    destinations: z.array(airportCodeSchema),
    departureWindow: z.object({ start: isoDateSchema, end: isoDateSchema }),
    tripDuration: z.object({
      minDays: z.number().int().positive(),
      maxDays: z.number().int().positive(),
    }),
    maxStops: z.number().int().nonnegative().max(4),
    maxPriceCents: z.number().int().positive().nullable(),
    targetPriceCents: z.number().int().positive().nullable(),
  })
  .partial()
  .refine(
    (b) =>
      !b.departureWindow || compareIsoDate(b.departureWindow.start, b.departureWindow.end) <= 0,
    { message: "departureWindow.start doit précéder ou égaler end", path: ["departureWindow"] },
  )
  .refine((b) => !b.tripDuration || b.tripDuration.minDays <= b.tripDuration.maxDays, {
    message: "tripDuration.minDays doit être <= maxDays",
    path: ["tripDuration"],
  });

export type UpdateSearchBody = z.infer<typeof updateSearchBodySchema>;

/** Corps de `POST /api/alerts`. */
export const createAlertBodySchema = z.object({
  searchId: z.string().uuid(),
  type: z.enum(ALERT_TYPES),
  thresholdEurCents: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
  cooldownSeconds: z.number().int().nonnegative().max(604_800).optional(),
});

export type CreateAlertBody = z.infer<typeof createAlertBodySchema>;
