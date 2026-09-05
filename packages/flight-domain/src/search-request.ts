import { z } from "zod";
import { airlineCodeSchema, airportCodeSchema } from "./iata.js";
import { cabinClassSchema } from "./cabin.js";
import { compareIsoDate, isoDateSchema } from "./dates.js";
import { moneySchema } from "./money.js";

/**
 * Recherche exprimée par l'utilisateur. `destinations` vide ⇒ mode Radar/Explore
 * (le moteur choisit les destinations). Les dates sont une **fenêtre** de départ ;
 * la génération des couples aller/retour se fait en Phase 3.
 */
export const flightSearchRequestSchema = z
  .object({
    origin: airportCodeSchema,
    destinations: z.array(airportCodeSchema).default([]),
    cabinClass: cabinClassSchema.default("BUSINESS"),
    departureWindow: z
      .object({ start: isoDateSchema, end: isoDateSchema })
      .refine((w) => compareIsoDate(w.start, w.end) <= 0, {
        message: "departureWindow.start doit précéder ou égaler end",
      }),
    tripDuration: z
      .object({
        minDays: z.number().int().positive(),
        maxDays: z.number().int().positive(),
      })
      .refine((d) => d.minDays <= d.maxDays, {
        message: "tripDuration.minDays doit être <= maxDays",
      }),
    maxStops: z.number().int().nonnegative().default(1),
    maxPrice: moneySchema.optional(),
    targetPrice: moneySchema.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, "code devise ISO 4217")
      .default("EUR"),
    preferredAirlines: z.array(airlineCodeSchema).default([]),
    excludedAirlines: z.array(airlineCodeSchema).default([]),
    passengers: z.object({ adults: z.number().int().positive().max(9) }).default({ adults: 1 }),
  })
  .refine(
    (r) =>
      r.maxPrice === undefined ||
      r.targetPrice === undefined ||
      r.targetPrice.amount <= r.maxPrice.amount,
    { message: "targetPrice doit être <= maxPrice" },
  )
  .refine((r) => r.preferredAirlines.every((a) => !r.excludedAirlines.includes(a)), {
    message: "une compagnie ne peut être à la fois préférée et exclue",
  });

export type FlightSearchRequest = z.infer<typeof flightSearchRequestSchema>;
export type FlightSearchRequestInput = z.input<typeof flightSearchRequestSchema>;

/** `true` si la recherche est en mode Radar (aucune destination imposée). */
export const isRadarSearch = (request: Pick<FlightSearchRequest, "destinations">): boolean =>
  request.destinations.length === 0;
