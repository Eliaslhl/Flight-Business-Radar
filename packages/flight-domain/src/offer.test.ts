import { describe, expect, it } from "vitest";
import { flightOfferSchema, isOneWay, offerMaxStops } from "./offer.js";

const validOffer = {
  provider: "mock",
  origin: "CDG",
  destination: "HND",
  cabinClass: "BUSINESS",
  outbound: {
    departureDate: "2026-11-10",
    departureAt: "2026-11-10T13:30:00+01:00",
    arrivalAt: "2026-11-11T09:15:00+09:00",
    durationMinutes: 705,
    stops: 0,
    marketingAirline: "AF",
    flightNumbers: ["AF276"],
  },
  inbound: {
    departureDate: "2026-11-20",
    departureAt: "2026-11-20T11:00:00+09:00",
    arrivalAt: "2026-11-20T16:30:00+01:00",
    durationMinutes: 810,
    stops: 1,
    marketingAirline: "AF",
    flightNumbers: ["AF275"],
  },
  price: { amount: 148650, currency: "EUR" },
  availability: "AVAILABLE",
  observedAt: "2026-09-06T00:00:00+02:00",
  fingerprint: "fbr_deadbeef",
};

describe("flightOfferSchema", () => {
  it("parse une offre valide et transforme le prix en Money", () => {
    const parsed = flightOfferSchema.parse(validOffer);
    expect(parsed.price).toEqual({ amount: 148650, currency: "EUR" });
    expect(parsed.outbound.marketingAirline).toBe("AF");
    expect(offerMaxStops(parsed)).toBe(1);
    expect(isOneWay(parsed)).toBe(false);
  });

  it("accepte un aller simple (inbound null)", () => {
    const parsed = flightOfferSchema.parse({ ...validOffer, inbound: null });
    expect(isOneWay(parsed)).toBe(true);
    expect(offerMaxStops(parsed)).toBe(0);
  });

  it("rejette un prix négatif, une devise invalide, une URL non http", () => {
    expect(
      flightOfferSchema.safeParse({ ...validOffer, price: { amount: -1, currency: "EUR" } })
        .success,
    ).toBe(false);
    expect(
      flightOfferSchema.safeParse({ ...validOffer, price: { amount: 100, currency: "eur" } })
        .success,
    ).toBe(false);
    expect(
      flightOfferSchema.safeParse({ ...validOffer, bookingUrl: "ftp://x.example/y" }).success,
    ).toBe(false);
  });

  it("applique les valeurs par défaut (availability, flightNumbers)", () => {
    const { availability, ...noAvail } = validOffer;
    void availability;
    const parsed = flightOfferSchema.parse(noAvail);
    expect(parsed.availability).toBe("UNKNOWN");
  });
});
