import { flightSearchRequestSchema } from "@fbr/flight-domain";
import { MockFlightProvider, ProviderRegistry } from "@fbr/flight-providers";
import { describe, expect, it } from "vitest";
import { normalizeSearchResults } from "./normalize.js";
import { makeOffer, testRequest } from "./fixtures.js";

describe("normalizeSearchResults", () => {
  it("valide, déduplique et renvoie des stats cohérentes", () => {
    const offers = [
      makeOffer({ provider: "a", fingerprint: "fbr_1", price: { amount: 150_000 } }),
      makeOffer({ provider: "b", fingerprint: "fbr_1", price: { amount: 120_000 } }), // doublon moins cher
      makeOffer({ provider: "a", fingerprint: "fbr_2", cabinClass: "ECONOMY" }), // rejeté
      makeOffer({ provider: "a", fingerprint: "fbr_3", price: { amount: 99_000 } }),
    ];

    const result = normalizeSearchResults(testRequest, offers, { preferProviders: ["a", "b"] });

    expect(result.stats).toEqual({ received: 4, rejected: 1, duplicates: 1, kept: 2 });
    expect(result.rejected[0]?.reason).toBe("CABIN_MISMATCH");
    expect(result.offers.find((o) => o.fingerprint === "fbr_1")?.price.amount).toBe(120_000);
    expect(result.offers.map((o) => o.fingerprint).sort()).toEqual(["fbr_1", "fbr_3"]);
  });

  it("ne lève jamais et renvoie tout en rejeté si rien n'est valide", () => {
    const result = normalizeSearchResults(testRequest, [makeOffer({ destination: "JFK" })]);
    expect(result.offers).toEqual([]);
    expect(result.stats.rejected).toBe(1);
  });

  it("intégration : ProviderRegistry (mock) → normalizer", async () => {
    const request = flightSearchRequestSchema.parse({
      origin: "CDG",
      destinations: ["HND"],
      departureWindow: { start: "2026-11-10", end: "2026-11-30" },
      tripDuration: { minDays: 10, maxDays: 14 },
    });

    const registry = new ProviderRegistry([
      new MockFlightProvider({ name: "mock-a", marketingAirline: "AF", basePriceEur: 1500 }),
      new MockFlightProvider({ name: "mock-b", marketingAirline: "AF", basePriceEur: 1300 }),
      new MockFlightProvider({ name: "mock-ko", scenario: "error" }),
    ]);

    const { offers, outcomes } = await registry.searchAll(request);
    expect(offers).toHaveLength(2); // 2 providers OK, même itinéraire → même empreinte
    expect(outcomes.some((o) => !o.ok)).toBe(true);

    const result = normalizeSearchResults(request, offers, {
      preferProviders: ["mock-b", "mock-a"],
    });
    // Même empreinte (compagnie/horaires/dates identiques) → 1 seule offre gardée, la moins chère.
    expect(result.stats.kept).toBe(1);
    expect(result.offers[0]?.provider).toBe("mock-b"); // base 1300 € < 1500 €
    expect(result.offers[0]?.price.amount).toBeGreaterThan(128_000);
    expect(result.offers[0]?.price.amount).toBeLessThan(132_000);
    expect(result.stats.duplicates).toBe(1);
  });
});
