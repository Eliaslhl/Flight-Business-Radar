import { flightOfferSchema, flightSearchRequestSchema, type FlightOffer } from "@fbr/flight-domain";

/** Recherche de référence pour les tests du normalizer. */
export const testRequest = flightSearchRequestSchema.parse({
  origin: "CDG",
  destinations: ["HND"],
  departureWindow: { start: "2026-11-01", end: "2026-11-30" },
  tripDuration: { minDays: 7, maxDays: 14 },
  excludedAirlines: ["LH"],
});

interface LegOverrides {
  departureDate?: string;
  departureAt?: string;
  arrivalAt?: string;
  durationMinutes?: number;
  stops?: number;
  marketingAirline?: string;
  flightNumbers?: string[];
}

export interface OfferOverrides {
  provider?: string;
  origin?: string;
  destination?: string;
  cabinClass?: string;
  fingerprint?: string;
  observedAt?: string;
  availability?: string;
  seatsRemaining?: number;
  price?: { amount?: number; currency?: string };
  outbound?: LegOverrides;
  inbound?: LegOverrides | null;
}

const baseLeg = (outbound: boolean): Required<LegOverrides> =>
  outbound
    ? {
        departureDate: "2026-11-10",
        departureAt: "2026-11-10T13:30:00+01:00",
        arrivalAt: "2026-11-11T09:15:00+09:00",
        durationMinutes: 705,
        stops: 0,
        marketingAirline: "AF",
        flightNumbers: ["AF276"],
      }
    : {
        departureDate: "2026-11-20",
        departureAt: "2026-11-20T11:00:00+09:00",
        arrivalAt: "2026-11-20T16:30:00+01:00",
        durationMinutes: 800,
        stops: 0,
        marketingAirline: "AF",
        flightNumbers: ["AF275"],
      };

/** Construit une offre valide, surchargée puis re-parsée par le schéma canonique. */
export const makeOffer = (overrides: OfferOverrides = {}): FlightOffer =>
  flightOfferSchema.parse({
    provider: overrides.provider ?? "mock",
    origin: overrides.origin ?? "CDG",
    destination: overrides.destination ?? "HND",
    cabinClass: overrides.cabinClass ?? "BUSINESS",
    outbound: { ...baseLeg(true), ...(overrides.outbound ?? {}) },
    inbound:
      overrides.inbound === null ? null : { ...baseLeg(false), ...(overrides.inbound ?? {}) },
    price: {
      amount: overrides.price?.amount ?? 148_600,
      currency: overrides.price?.currency ?? "EUR",
    },
    availability: overrides.availability ?? "AVAILABLE",
    seatsRemaining: overrides.seatsRemaining ?? 4,
    observedAt: overrides.observedAt ?? "2026-09-06T08:00:00.000Z",
    fingerprint: overrides.fingerprint ?? "fbr_base",
  });
