import { z } from "zod";
import { airlineCodeSchema, airportCodeSchema } from "./iata.js";
import { availabilitySchema, cabinClassSchema } from "./cabin.js";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import { moneySchema } from "./money.js";

/** URL de réservation : http(s) uniquement (Phase 0 §23). */
export const httpUrlSchema = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "URL http(s) attendue");

export const flightSegmentSchema = z.object({
  from: airportCodeSchema,
  to: airportCodeSchema,
  marketingAirline: airlineCodeSchema,
  operatingAirline: airlineCodeSchema.optional(),
  flightNumber: z.string().min(2).max(8),
  departureAt: isoDateTimeSchema,
  arrivalAt: isoDateTimeSchema,
});
export type FlightSegment = z.infer<typeof flightSegmentSchema>;

export const flightLegSchema = z.object({
  departureDate: isoDateSchema,
  departureAt: isoDateTimeSchema,
  arrivalAt: isoDateTimeSchema,
  durationMinutes: z.number().int().positive(),
  stops: z.number().int().nonnegative(),
  marketingAirline: airlineCodeSchema,
  operatingAirline: airlineCodeSchema.optional(),
  flightNumbers: z.array(z.string().min(2).max(8)).default([]),
  segments: z.array(flightSegmentSchema).optional(),
});
export type FlightLeg = z.infer<typeof flightLegSchema>;

/**
 * Offre de vol **normalisée** (modèle interne unique, indépendant du provider).
 * `inbound = null` ⇒ aller simple. `fingerprint` identifie l'offre pour la
 * déduplication et le rattachement des snapshots de prix.
 */
export const flightOfferSchema = z.object({
  provider: z.string().min(1),
  origin: airportCodeSchema,
  destination: airportCodeSchema,
  cabinClass: cabinClassSchema,
  outbound: flightLegSchema,
  inbound: flightLegSchema.nullable(),
  price: moneySchema,
  fareBrand: z.string().min(1).optional(),
  bookingUrl: httpUrlSchema.optional(),
  availability: availabilitySchema.default("UNKNOWN"),
  seatsRemaining: z.number().int().nonnegative().optional(),
  observedAt: isoDateTimeSchema,
  fingerprint: z.string().min(1),
  raw: z.unknown().optional(),
});
export type FlightOffer = z.infer<typeof flightOfferSchema>;

/** Nombre d'escales le plus élevé des deux trajets (comparable à `maxStops`). */
export const offerMaxStops = (offer: Pick<FlightOffer, "outbound" | "inbound">): number =>
  Math.max(offer.outbound.stops, offer.inbound?.stops ?? 0);

/** `true` si l'offre est un aller simple. */
export const isOneWay = (offer: Pick<FlightOffer, "inbound">): boolean => offer.inbound === null;
