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
