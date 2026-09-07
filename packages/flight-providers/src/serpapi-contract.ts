import { z } from "zod";

/**
 * Schéma **tolérant** de la réponse SerpApi Google Flights (`engine=google_flights`).
 * SerpApi fait évoluer ses payloads : on ne valide que ce dont le mapping a besoin,
 * `passthrough()` laisse le reste intact pour `raw`.
 * Réf. : https://serpapi.com/google-flights-api
 */

const airportRefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    /** Heure locale « YYYY-MM-DD HH:MM » (sans fuseau). */
    time: z.string().optional(),
  })
  .passthrough();

export const serpLegSchema = z
  .object({
    departure_airport: airportRefSchema,
    arrival_airport: airportRefSchema,
    duration: z.number().int().positive().optional(),
    airline: z.string().optional(),
    airline_logo: z.string().optional(),
    flight_number: z.string().optional(),
    travel_class: z.string().optional(),
    airplane: z.string().optional(),
    overnight: z.boolean().optional(),
  })
  .passthrough();
export type SerpLeg = z.infer<typeof serpLegSchema>;

export const serpLayoverSchema = z
  .object({
    duration: z.number().optional(),
    name: z.string().optional(),
    id: z.string().optional(),
  })
  .passthrough();

export const serpFlightOptionSchema = z
  .object({
    flights: z.array(serpLegSchema).min(1),
    layovers: z.array(serpLayoverSchema).default([]),
    total_duration: z.number().int().positive().optional(),
    /** Prix total (unités entières de la devise demandée). Absent pour certaines options. */
    price: z.number().positive().optional(),
    type: z.string().optional(),
    airline_logo: z.string().optional(),
    departure_token: z.string().optional(),
    booking_token: z.string().optional(),
  })
  .passthrough();
export type SerpFlightOption = z.infer<typeof serpFlightOptionSchema>;

export const serpApiFlightsResponseSchema = z
  .object({
    /** SerpApi renvoie 200 + `error` pour « aucun résultat » comme pour une requête invalide. */
    error: z.string().optional(),
    best_flights: z.array(serpFlightOptionSchema).default([]),
    other_flights: z.array(serpFlightOptionSchema).default([]),
    price_insights: z
      .object({
        lowest_price: z.number().optional(),
        price_level: z.string().optional(),
        typical_price_range: z.array(z.number()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type SerpApiFlightsResponse = z.infer<typeof serpApiFlightsResponseSchema>;
