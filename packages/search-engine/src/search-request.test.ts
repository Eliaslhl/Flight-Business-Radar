import { describe, expect, it } from "vitest";
import {
  buildRequestForCombination,
  buildRequestForOffer,
  buildWindowRequest,
  type SearchLike,
} from "./search-request.js";

const search: SearchLike = {
  origin: "CDG",
  destinations: ["HND"],
  cabinClass: "BUSINESS",
  minTripDays: 7,
  maxTripDays: 14,
  departureWindowStart: "2026-10-01",
  departureWindowEnd: "2026-12-15",
  maxPriceCents: 150_000,
  targetPriceCents: 120_000,
  currency: "EUR",
  maxStops: 1,
  preferredAirlines: [],
  excludedAirlines: ["LH"],
};

describe("buildRequestForCombination", () => {
  it("cible exactement une combinaison (fenêtre 1 jour, durée fixe)", () => {
    const req = buildRequestForCombination(search, {
      outboundDate: "2026-11-10",
      returnDate: "2026-11-20",
      tripDays: 10,
    });
    expect(req.departureWindow).toEqual({ start: "2026-11-10", end: "2026-11-10" });
    expect(req.tripDuration).toEqual({ minDays: 10, maxDays: 10 });
    expect(req.targetPrice).toEqual({ amount: 120_000, currency: "EUR" });
    expect(req.maxPrice).toEqual({ amount: 150_000, currency: "EUR" });
    expect(req.excludedAirlines).toEqual(["LH"]);
  });

  it("déduit tripDays depuis returnDate quand il n'est pas fourni", () => {
    const req = buildRequestForCombination(search, {
      outboundDate: "2026-11-10",
      returnDate: "2026-11-19",
      tripDays: null,
    });
    expect(req.tripDuration).toEqual({ minDays: 9, maxDays: 9 });
  });

  it("omet target/maxPrice quand ils sont nuls", () => {
    const req = buildRequestForCombination(
      { ...search, maxPriceCents: null, targetPriceCents: null },
      { outboundDate: "2026-11-10", returnDate: "2026-11-20", tripDays: 10 },
    );
    expect(req.maxPrice).toBeUndefined();
    expect(req.targetPrice).toBeUndefined();
  });
});

describe("buildWindowRequest", () => {
  it("reprend la fenêtre et la plage de durée complètes", () => {
    const req = buildWindowRequest(search);
    expect(req.departureWindow).toEqual({ start: "2026-10-01", end: "2026-12-15" });
    expect(req.tripDuration).toEqual({ minDays: 7, maxDays: 14 });
  });
});

describe("buildRequestForOffer", () => {
  it("cible l'itinéraire exact d'une offre connue", () => {
    const req = buildRequestForOffer(search, {
      destination: "ICN",
      outboundDate: "2026-11-05",
      returnDate: "2026-11-14",
      tripDays: 9,
    });
    expect(req.destinations).toEqual(["ICN"]);
    expect(req.departureWindow).toEqual({ start: "2026-11-05", end: "2026-11-05" });
    expect(req.tripDuration).toEqual({ minDays: 9, maxDays: 9 });
  });
});
