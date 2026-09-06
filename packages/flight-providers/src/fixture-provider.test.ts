import { flightOfferSchema, flightSearchRequestSchema } from "@fbr/flight-domain";
import { describe, expect, it } from "vitest";
import { FixtureFlightProvider, loadFixtureOffers } from "./fixture-provider.js";

const offerJson = (destination: string, price: number) => ({
  provider: "seed",
  origin: "CDG",
  destination,
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
  inbound: null,
  price: { amount: price, currency: "EUR" },
  availability: "AVAILABLE",
  observedAt: "2026-09-06T08:00:00.000Z",
  fingerprint: `fbr_${destination}_${String(price)}`,
});

describe("loadFixtureOffers", () => {
  it("parse un tableau JSON via le schéma canonique et rejette les invalides", () => {
    const offers = loadFixtureOffers([offerJson("HND", 138900), offerJson("ICN", 121000)]);
    expect(offers).toHaveLength(2);
    expect(() => loadFixtureOffers([{ bad: true }])).toThrow();
    expect(() => loadFixtureOffers({})).toThrow();
  });
});

describe("FixtureFlightProvider", () => {
  const offers = [
    flightOfferSchema.parse(offerJson("HND", 138900)),
    flightOfferSchema.parse(offerJson("ICN", 121000)),
    flightOfferSchema.parse(offerJson("JFK", 99000)),
  ];
  const req = (destinations: string[]) =>
    flightSearchRequestSchema.parse({
      origin: "CDG",
      destinations,
      departureWindow: { start: "2026-11-10", end: "2026-11-30" },
      tripDuration: { minDays: 10, maxDays: 14 },
    });

  it("ne renvoie que les offres de la route demandée, avec son propre nom", async () => {
    const provider = new FixtureFlightProvider({ offers, name: "fx" });
    const result = await provider.searchFlights(req(["HND", "ICN"]));
    expect(result.map((o) => o.destination).sort()).toEqual(["HND", "ICN"]);
    expect(result.every((o) => o.provider === "fx")).toBe(true);
  });

  it("mode Radar : renvoie toutes les offres de l'origine", async () => {
    const provider = new FixtureFlightProvider({ offers });
    expect(await provider.searchFlights(req([]))).toHaveLength(3);
  });

  it("accepte une fabrique dépendante de la requête", async () => {
    const provider = new FixtureFlightProvider({
      offers: (r) => (r.destinations.some((d) => String(d) === "HND") ? [offers[0]!] : []),
    });
    expect(await provider.searchFlights(req(["HND"]))).toHaveLength(1);
    expect(await provider.searchFlights(req(["ICN"]))).toHaveLength(0);
  });
});
