import { type AnalyticsReport, type RecommendationReport } from "@fbr/analytics";
import { describe, expect, it } from "vitest";
import { buildAdvisorInput, collectAllowedValues, type AdvisorSearchMeta } from "./facts.js";

const search: AdvisorSearchMeta = {
  origin: "CDG",
  destinations: ["HND"],
  departureWindowStart: "2026-11-10",
  departureWindowEnd: "2026-11-24",
  minTripDays: 12,
  maxTripDays: 14,
  targetPriceCents: 130_000,
  maxPriceCents: 180_000,
};

const analytics = {
  currency: "EUR",
  sampleSize: 80,
  reliable: true,
  summary: {
    count: 80,
    min: 112_000,
    max: 190_000,
    mean: 145_400,
    median: 142_000,
    p10: 121_000,
    p25: 130_000,
    p75: 165_000,
    p90: 172_000,
    stdDev: 20_000,
    coefficientOfVariation: 0.14,
  },
  trend: { slopePerDay: -300, direction: "FALLING", changePct: -0.08, points: 80, r2: 0.4 },
  best: { priceEurCents: 112_000, observedAt: "2026-09-20T00:00:00.000Z" },
  latest: { priceEurCents: 118_000, observedAt: "2026-10-01T00:00:00.000Z" },
  byMonth: [],
  byDayOfWeek: [],
  byTripDuration: [],
  byAirline: [],
  byStops: [],
  bestMonth: { key: "2026-11", meanEurCents: 138_000, reliable: true },
} satisfies AnalyticsReport;

const recommendation = {
  currency: "EUR",
  generatedAt: "2026-10-01T09:00:00.000Z",
  sampleSize: 80,
  opportunity: { score: 78, band: "GOOD", reasons: ["Sous ton prix cible"], factors: null },
  dates: [
    {
      outboundDate: "2026-11-17",
      returnDate: "2026-11-29",
      tripDays: 12,
      latestPriceEurCents: 118_000,
      minPriceEurCents: 116_000,
      sampleSize: 12,
      reliable: true,
      deltaVsMedianPct: -0.169,
    },
  ],
  radar: null,
} satisfies RecommendationReport;

describe("buildAdvisorInput", () => {
  it("assemble un jeu de faits compact et cohérent", () => {
    const input = buildAdvisorInput({
      search,
      analytics,
      recommendation,
      now: new Date("2026-10-01T09:00:00.000Z"),
    });
    expect(input.route).toEqual({ origin: "CDG", destinations: ["HND"], radar: false });
    expect(input.daysUntilDeparture).toBe(40);
    expect(input.observations).toBe(80);
    expect(input.price.medianEurCents).toBe(142_000);
    expect(input.trend).toEqual({ direction: "FALLING", changePct: -0.08 });
    expect(input.topDates).toHaveLength(1);
    expect(input.radarTop).toEqual([]);
  });

  it("radar:true quand la recherche n'a pas de destination", () => {
    const input = buildAdvisorInput({
      search: { ...search, destinations: [] },
      analytics,
      recommendation: { ...recommendation, radar: [] },
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    expect(input.route.radar).toBe(true);
  });
});

describe("collectAllowedValues", () => {
  it("expose les euros arrondis (±1), pourcentages, comptes et dates ISO des faits", () => {
    const input = buildAdvisorInput({
      search,
      analytics,
      recommendation,
      now: new Date("2026-10-01T09:00:00.000Z"),
    });
    const a = collectAllowedValues(input);
    expect(a.euros.has(1420)).toBe(true); // médiane 142 000 c
    expect(a.euros.has(1421)).toBe(true); // tolérance
    expect(a.euros.has(1300)).toBe(true); // cible
    expect(a.percents.has(8)).toBe(true); // |changePct|
    expect(a.percents.has(17)).toBe(true); // |deltaVsMedianPct| topDate
    expect(a.counts.has(40)).toBe(true); // jours avant départ
    expect(a.counts.has(100)).toBe(true); // échelle score
    expect(a.isoDates.has("2026-11-10")).toBe(true);
    expect(a.isoDates.has("2026-11-17")).toBe(true);
    expect(a.euros.has(9999)).toBe(false);
  });
});
