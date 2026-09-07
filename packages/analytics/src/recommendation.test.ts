import { describe, expect, it } from "vitest";
import { summarize } from "./descriptive.js";
import {
  buildRecommendationReport,
  computeOpportunityScore,
  rankRadarDestinations,
  recommendDates,
  type RecommendationObservation,
} from "./recommendation.js";

const summary = summarize([
  1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350, 1400, 1450, 1500, 1550, 1600, 1650, 1700, 1750,
  1800, 1850, 1900, 2000,
]);

describe("computeOpportunityScore", () => {
  it("renvoie INSUFFICIENT_DATA sous le seuil d'échantillon", () => {
    const r = computeOpportunityScore({
      currentPriceEurCents: 1000,
      summary,
      trendDirection: "STABLE",
      daysUntilDeparture: 20,
      sampleSize: 5,
      minSampleSize: 20,
    });
    expect(r.score).toBeNull();
    expect(r.band).toBe("INSUFFICIENT_DATA");
    expect(r.factors).toBeNull();
  });

  it("prix très bas + tendance haussière + départ proche + sous la cible ⇒ EXCEPTIONAL", () => {
    const r = computeOpportunityScore({
      currentPriceEurCents: 950,
      summary,
      trendDirection: "RISING",
      daysUntilDeparture: 10,
      targetEurCents: 1000,
      sampleSize: 40,
    });
    expect(r.score).toBe(100); // 60 + 15 + 15 + 10, clampé
    expect(r.band).toBe("EXCEPTIONAL");
    expect(r.reasons.join(" ")).toMatch(/10ᵉ percentile/);
    expect(r.factors?.priceVsMedianPct).toBeLessThan(0);
  });

  it("prix élevé + tendance baissière + départ lointain ⇒ POOR", () => {
    const r = computeOpportunityScore({
      currentPriceEurCents: 1950,
      summary,
      trendDirection: "FALLING",
      daysUntilDeparture: 200,
      sampleSize: 40,
    });
    expect(r.score).toBeLessThan(40);
    expect(r.band).toBe("POOR");
  });

  it("score borné 0-100 et bandes monotones", () => {
    const mk = (price: number) =>
      computeOpportunityScore({
        currentPriceEurCents: price,
        summary,
        trendDirection: "STABLE",
        daysUntilDeparture: 45,
        sampleSize: 40,
      }).score ?? -1;
    expect(mk(950)).toBeGreaterThan(mk(1300));
    expect(mk(1300)).toBeGreaterThanOrEqual(mk(1900));
    expect(mk(950)).toBeLessThanOrEqual(100);
    expect(mk(3000)).toBeGreaterThanOrEqual(0);
  });
});

const obs = (
  destination: string,
  outboundDate: string,
  observedAt: string,
  priceEurCents: number,
): RecommendationObservation => ({
  destination,
  outboundDate,
  returnDate: null,
  tripDays: 12,
  observedAt,
  priceEurCents,
});

describe("recommendDates", () => {
  const data: RecommendationObservation[] = [
    obs("HND", "2026-11-10", "2026-09-01T08:00:00Z", 150_000),
    obs("HND", "2026-11-10", "2026-09-02T08:00:00Z", 142_000),
    obs("HND", "2026-11-17", "2026-09-01T08:00:00Z", 120_000),
    obs("HND", "2026-11-17", "2026-09-02T08:00:00Z", 118_000),
    obs("HND", "2026-11-24", "2026-09-02T08:00:00Z", 160_000),
  ];

  it("classe les couples de dates par dernier prix et calcule l'écart médian", () => {
    const recs = recommendDates(data, { top: 2, minSampleSize: 2 });
    expect(recs.map((r) => r.outboundDate)).toEqual(["2026-11-17", "2026-11-10"]);
    expect(recs[0]).toMatchObject({
      latestPriceEurCents: 118_000,
      minPriceEurCents: 118_000,
      sampleSize: 2,
      reliable: true,
    });
    expect(recs[0]!.deltaVsMedianPct).toBeLessThan(0);
  });

  it("marque reliable:false sous le seuil d'échantillon mais liste quand même", () => {
    const recs = recommendDates(data, { top: 5, minSampleSize: 3 });
    expect(recs.every((r) => r.reliable === false)).toBe(true);
    expect(recs).toHaveLength(3);
  });
});

describe("rankRadarDestinations", () => {
  const data: RecommendationObservation[] = [
    obs("HND", "2026-11-10", "2026-09-01T08:00:00Z", 150_000),
    obs("HND", "2026-11-17", "2026-09-02T08:00:00Z", 140_000),
    obs("JFK", "2026-11-10", "2026-09-01T08:00:00Z", 90_000),
    obs("JFK", "2026-11-17", "2026-09-02T08:00:00Z", 88_000),
    obs("DXB", "2026-11-12", "2026-09-02T08:00:00Z", 110_000),
  ];

  it("classe les destinations par dernier prix, garde min + meilleure date", () => {
    const ranks = rankRadarDestinations(data, { minSampleSize: 2 });
    expect(ranks.map((r) => r.destination)).toEqual(["JFK", "DXB", "HND"]);
    expect(ranks[0]).toMatchObject({
      latestPriceEurCents: 88_000,
      minPriceEurCents: 88_000,
      bestOutboundDate: "2026-11-17",
      reliable: true,
    });
    expect(ranks.find((r) => r.destination === "DXB")?.reliable).toBe(false);
  });

  it("respecte l'option top", () => {
    expect(rankRadarDestinations(data, { top: 1 })).toHaveLength(1);
  });
});

describe("buildRecommendationReport", () => {
  const now = new Date("2026-09-05T00:00:00Z");
  const many: RecommendationObservation[] = Array.from({ length: 30 }, (_, i) =>
    obs("HND", "2026-11-10", `2026-09-0${(i % 5) + 1}T0${i % 8}:00:00Z`, 120_000 + i * 1000),
  );

  it("assemble opportunité + dates ; pas de section radar avec une seule destination", () => {
    const rep = buildRecommendationReport(many, {
      now,
      departureWindowStart: "2026-11-10",
      targetEurCents: 130_000,
    });
    expect(rep.currency).toBe("EUR");
    expect(rep.sampleSize).toBe(30);
    expect(rep.opportunity.score).not.toBeNull();
    expect(rep.dates.length).toBeGreaterThan(0);
    expect(rep.radar).toBeNull();
  });

  it("active la section radar dès qu'il y a plusieurs destinations", () => {
    const multi = [...many, obs("JFK", "2026-11-10", "2026-09-05T09:00:00Z", 95_000)];
    const rep = buildRecommendationReport(multi, { now, departureWindowStart: "2026-11-10" });
    expect(rep.radar).not.toBeNull();
    expect(rep.radar?.[0]?.destination).toBe("JFK");
  });
});
