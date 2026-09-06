import { eq, sql } from "drizzle-orm";
import { type Database } from "../client.js";
import { flightOffers, offerProviderLinks, type FlightOfferRow } from "../schema/core.table.js";

export interface UpsertOfferInput {
  fingerprint: string;
  origin: string;
  destination: string;
  cabinClass: FlightOfferRow["cabinClass"];
  outboundDate: string;
  returnDate: string | null;
  tripDays: number | null;
  marketingAirline: string | null;
  maxStops: number;
  payload: Record<string, unknown>;
}

/**
 * Insère l'offre ou, si l'empreinte existe déjà, met à jour le payload +
 * `last_seen_at`. Retourne l'id (nouveau ou existant).
 */
export const upsertOffer = async (
  db: Database,
  input: UpsertOfferInput,
): Promise<{ id: string }> => {
  const [row] = await db
    .insert(flightOffers)
    .values({
      fingerprint: input.fingerprint,
      origin: input.origin,
      destination: input.destination,
      cabinClass: input.cabinClass,
      outboundDate: input.outboundDate,
      returnDate: input.returnDate,
      tripDays: input.tripDays,
      marketingAirline: input.marketingAirline,
      maxStops: input.maxStops,
      payload: input.payload,
    })
    .onConflictDoUpdate({
      target: flightOffers.fingerprint,
      set: { payload: input.payload, lastSeenAt: sql`now()` },
    })
    .returning({ id: flightOffers.id });
  if (!row) throw new Error("upsertOffer: aucune ligne retournée");
  return row;
};

export interface UpsertProviderLinkInput {
  flightOfferId: string;
  provider: string;
  providerOfferId?: string | null;
  bookingUrl?: string | null;
}

export const upsertProviderLink = async (
  db: Database,
  input: UpsertProviderLinkInput,
): Promise<void> => {
  await db
    .insert(offerProviderLinks)
    .values({
      flightOfferId: input.flightOfferId,
      provider: input.provider,
      providerOfferId: input.providerOfferId ?? null,
      bookingUrl: input.bookingUrl ?? null,
    })
    .onConflictDoUpdate({
      target: [offerProviderLinks.flightOfferId, offerProviderLinks.provider],
      set: {
        providerOfferId: input.providerOfferId ?? null,
        bookingUrl: input.bookingUrl ?? null,
        lastSeenAt: sql`now()`,
      },
    });
};

export const getOfferByFingerprint = async (
  db: Database,
  fingerprint: string,
): Promise<FlightOfferRow | undefined> => {
  const [row] = await db
    .select()
    .from(flightOffers)
    .where(eq(flightOffers.fingerprint, fingerprint))
    .limit(1);
  return row;
};
