import { flightSearchRequestSchema, type FlightSearchRequest } from "@fbr/flight-domain";
import { ProviderError } from "@fbr/shared";
import { describe, expect, it } from "vitest";
import { MockFlightProvider } from "./mock-provider.js";

const request = (overrides: Record<string, unknown> = {}): FlightSearchRequest =>
  flightSearchRequestSchema.parse({
    origin: "CDG",
    destinations: ["HND"],
    departureWindow: { start: "2026-11-10", end: "2026-11-30" },
    tripDuration: { minDays: 10, maxDays: 14 },
    ...overrides,
  });

const FIXED_NOW = "2026-09-06T08:00:00.000Z";

describe("MockFlightProvider", () => {
  it("produit une offre Business valide et déterministe pour le scénario normal", async () => {
    const provider = new MockFlightProvider({ seed: 42, now: () => FIXED_NOW });
    const [offer] = await provider.searchFlights(request());
    expect(offer?.cabinClass).toBe("BUSINESS");
    expect(offer?.origin).toBe("CDG");
    expect(offer?.destination).toBe("HND");
    expect(offer?.outbound.departureDate).toBe("2026-11-10");
    expect(offer?.inbound?.departureDate).toBe("2026-11-20");
    expect(offer?.availability).toBe("AVAILABLE");
    expect(offer?.observedAt).toBe(FIXED_NOW);
    expect(offer?.fingerprint).toMatch(/^fbr_/);

    const again = new MockFlightProvider({ seed: 42, now: () => FIXED_NOW });
    const [offer2] = await again.searchFlights(request());
    expect(offer2?.price).toEqual(offer?.price);
  });

  it("flash-drop suit la séquence 1486 → ~1413 → ~1245 → ~941 → 1486", async () => {
    const provider = new MockFlightProvider({ scenario: "flash-drop", basePriceEur: 1486 });
    const prices: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const [offer] = await provider.searchFlights(request());
      prices.push(offer?.price.amount ?? 0);
    }
    expect(prices[0]).toBe(148600);
    expect(prices[3]).toBeLessThan(100000); // creux marqué
    expect(prices[3]).toBeLessThan(prices[2]!);
    expect(prices[4]).toBe(148600); // prix remonté
    expect(provider.callCount).toBe(5);
  });

  it("gradual-drop décroît strictement puis se stabilise", async () => {
    const provider = new MockFlightProvider({ scenario: "gradual-drop" });
    const p0 = (await provider.searchFlights(request()))[0]?.price.amount ?? 0;
    const p1 = (await provider.searchFlights(request()))[0]?.price.amount ?? 0;
    const p2 = (await provider.searchFlights(request()))[0]?.price.amount ?? 0;
    expect(p1).toBeLessThan(p0);
    expect(p2).toBeLessThan(p1);
  });

  it("record-low renvoie un nouveau plus-bas à chaque appel", async () => {
    const provider = new MockFlightProvider({ scenario: "record-low" });
    let previous = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 4; i += 1) {
      const [offer] = await provider.searchFlights(request());
      const price = offer?.price.amount ?? 0;
      expect(price).toBeLessThan(previous);
      previous = price;
    }
  });

  it("unavailable renvoie une offre non disponible (WAITLIST, 0 siège)", async () => {
    const provider = new MockFlightProvider({ scenario: "unavailable" });
    const [offer] = await provider.searchFlights(request());
    expect(offer?.availability).toBe("WAITLIST");
    expect(offer?.seatsRemaining).toBe(0);
  });

  it("error lève une ProviderError retryable", async () => {
    const provider = new MockFlightProvider({ scenario: "error" });
    await expect(provider.searchFlights(request())).rejects.toBeInstanceOf(ProviderError);
  });

  it("timeout lève une ProviderError PROVIDER_TIMEOUT", async () => {
    const provider = new MockFlightProvider({ scenario: "timeout" });
    await expect(provider.searchFlights(request())).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
      retryable: true,
    });
  });

  it("mode Radar : une offre par destination de repli", async () => {
    const provider = new MockFlightProvider({ radarFallbackDestination: "ICN" });
    const offers = await provider.searchFlights(request({ destinations: [] }));
    expect(offers).toHaveLength(1);
    expect(offers[0]?.destination).toBe("ICN");
  });
});
