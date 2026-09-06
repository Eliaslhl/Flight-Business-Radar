import { z } from "zod";

/**
 * Contrat de réponse du sidecar `services/flight-scraper`. Validé à la frontière
 * (data quality — Phase 0 §29) avant conversion vers `FlightOffer`.
 */

export const scraperLegSchema = z.object({
  airlineName: z.string().nullish(),
  airlineCode: z.string().nullish(),
  flightNumbers: z.array(z.string()).default([]),
  departureAt: z.string().nullish(),
  arrivalAt: z.string().nullish(),
  durationMinutes: z.number().int().positive().nullish(),
  stops: z.number().int().nonnegative().default(0),
  fromCode: z.string().nullish(),
  toCode: z.string().nullish(),
});
export type ScraperLeg = z.infer<typeof scraperLegSchema>;

export const scraperOfferSchema = z.object({
  priceCents: z.number().int().positive(),
  currency: z.string(),
  totalStops: z.number().int().nonnegative().default(0),
  isBest: z.boolean().default(false),
  bookingUrl: z.string().nullish(),
  outbound: scraperLegSchema,
  inbound: scraperLegSchema.nullish(),
});
export type ScraperOffer = z.infer<typeof scraperOfferSchema>;

export const scraperResponseSchema = z.object({
  provider: z.string().default("fast-flights"),
  mode: z.string().optional(),
  degraded: z.boolean().default(false),
  currency: z.string(),
  fetchedAt: z.string().optional(),
  offers: z.array(scraperOfferSchema).default([]),
  error: z.string().nullish(),
});
export type ScraperResponse = z.infer<typeof scraperResponseSchema>;
