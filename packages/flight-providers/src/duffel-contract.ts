import { z } from "zod";

/**
 * Schéma **tolérant** de la réponse Duffel `POST /air/offer_requests?return_offers=true`
 * (API v2). On ne valide que ce dont le mapping a besoin ; `passthrough()` conserve
 * le reste pour `raw`. Réf. : https://duffel.com/docs/api/offers/schema
 */

const iataRefSchema = z
  .object({ iata_code: z.string().min(2).optional(), name: z.string().optional() })
  .passthrough();

export const duffelSegmentSchema = z
  .object({
    origin: iataRefSchema,
    destination: iataRefSchema,
    departing_at: z.string(),
    arriving_at: z.string(),
    duration: z.string().optional(),
    marketing_carrier: iataRefSchema.optional(),
    operating_carrier: iataRefSchema.optional(),
    marketing_carrier_flight_number: z.string().optional(),
    aircraft: z.object({ name: z.string().optional() }).passthrough().nullish(),
  })
  .passthrough();
export type DuffelSegment = z.infer<typeof duffelSegmentSchema>;

export const duffelSliceSchema = z
  .object({
    origin: iataRefSchema,
    destination: iataRefSchema,
    duration: z.string().optional(),
    segments: z.array(duffelSegmentSchema).min(1),
  })
  .passthrough();
export type DuffelSlice = z.infer<typeof duffelSliceSchema>;

export const duffelOfferSchema = z
  .object({
    id: z.string(),
    total_amount: z.string(),
    total_currency: z.string().length(3),
    owner: iataRefSchema.optional(),
    slices: z.array(duffelSliceSchema).min(1),
    expires_at: z.string().optional(),
  })
  .passthrough();
export type DuffelOffer = z.infer<typeof duffelOfferSchema>;

export const duffelOfferRequestResponseSchema = z
  .object({
    data: z
      .object({
        id: z.string().optional(),
        offers: z.array(duffelOfferSchema).default([]),
      })
      .passthrough(),
  })
  .passthrough();
export type DuffelOfferRequestResponse = z.infer<typeof duffelOfferRequestResponseSchema>;

/** Corps d'erreur Duffel (`{ errors: [{ title, message, code }] }`). */
export const duffelErrorResponseSchema = z
  .object({
    errors: z
      .array(
        z
          .object({
            title: z.string().optional(),
            message: z.string().optional(),
            code: z.string().optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();
