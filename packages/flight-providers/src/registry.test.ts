import { flightSearchRequestSchema, type FlightSearchRequest } from "@fbr/flight-domain";
import { describe, expect, it } from "vitest";
import { MockFlightProvider } from "./mock-provider.js";
import { ProviderRegistry } from "./registry.js";

const request: FlightSearchRequest = flightSearchRequestSchema.parse({
  origin: "CDG",
  destinations: ["HND", "ICN"],
  departureWindow: { start: "2026-11-10", end: "2026-11-30" },
  tripDuration: { minDays: 10, maxDays: 14 },
});

describe("ProviderRegistry", () => {
  it("agrège les offres de plusieurs providers en succès", async () => {
    const registry = new ProviderRegistry([
      new MockFlightProvider({ name: "mock-a", marketingAirline: "AF" }),
      new MockFlightProvider({ name: "mock-b", marketingAirline: "JL" }),
    ]);
    const { offers, outcomes } = await registry.searchAll(request);

    expect(registry.names).toEqual(["mock-a", "mock-b"]);
    expect(offers).toHaveLength(4); // 2 providers × 2 destinations
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(outcomes[0]?.offerCount).toBe(2);
    expect(outcomes[0]?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("isole les échecs : un provider en erreur n'empêche pas les autres", async () => {
    const registry = new ProviderRegistry([
      new MockFlightProvider({ name: "ok", marketingAirline: "AF" }),
      new MockFlightProvider({ name: "ko", scenario: "error" }),
      new MockFlightProvider({ name: "slow", scenario: "timeout" }),
    ]);
    const { offers, outcomes } = await registry.searchAll(request);

    expect(offers).toHaveLength(2); // seul "ok" a répondu
    const byName = Object.fromEntries(outcomes.map((o) => [o.provider, o]));
    expect(byName.ok?.ok).toBe(true);
    expect(byName.ko?.ok).toBe(false);
    expect(byName.ko?.error?.code).toBe("PROVIDER_ERROR");
    expect(byName.slow?.error?.code).toBe("PROVIDER_TIMEOUT");
    expect(byName.slow?.error?.retryable).toBe(true);
  });

  it("ne rejette jamais, même si tous les providers échouent", async () => {
    const registry = new ProviderRegistry([new MockFlightProvider({ scenario: "error" })]);
    const result = await registry.searchAll(request);
    expect(result.offers).toEqual([]);
    expect(result.outcomes[0]?.ok).toBe(false);
  });
});
