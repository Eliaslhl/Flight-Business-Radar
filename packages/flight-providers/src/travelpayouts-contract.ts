import { z } from "zod";

/**
 * Schéma **tolérant** de la réponse Travelpayouts Data API `GET /v2/prices/latest`.
 * Données **en cache** (recherches réelles des utilisateurs Aviasales, fraîcheur
 * ~48 h) : chaque ligne porte `found_at` (instant de la trouvaille) — c'est lui
 * qui sert d'`observedAt`, pas l'heure du sondage.
 * Réf. : https://travelpayouts-data-api.readthedocs.io
 */

export const tpPriceRowSchema = z
  .object({
    origin: z.string().optional(),
    destination: z.string().optional(),
    /** `YYYY-MM-DD`. */
    depart_date: z.string(),
    return_date: z.string().nullish(),
    /** Prix : `value` sur `/v2/prices/latest`, `price` sur d'autres endpoints. */
    value: z.number().positive().optional(),
    price: z.number().positive().optional(),
    number_of_changes: z.number().int().nonnegative().optional(),
    transfers: z.number().int().nonnegative().optional(),
    /** 0 économie · 1 business · 2 first. */
    trip_class: z.number().int().optional(),
    /** ISO 8601 UTC (parfois sans suffixe `Z`). */
    found_at: z.string().optional(),
    actual: z.boolean().optional(),
    airline: z.string().optional(),
    flight_number: z.union([z.string(), z.number()]).optional(),
    departure_at: z.string().optional(),
    return_at: z.string().optional(),
    duration: z.number().optional(),
    distance: z.number().optional(),
    gate: z.string().optional(),
  })
  .passthrough();
export type TpPriceRow = z.infer<typeof tpPriceRowSchema>;

export const tpLatestResponseSchema = z
  .object({
    success: z.boolean().optional(),
    data: z.array(tpPriceRowSchema).default([]),
    error: z.string().nullish(),
    currency: z.string().optional(),
  })
  .passthrough();
export type TpLatestResponse = z.infer<typeof tpLatestResponseSchema>;
