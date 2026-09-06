import { describe, expect, it } from "vitest";
import { buildAnalyticsReport } from "./report.js";
import { monthlyStats, type PriceObservation } from "./grouped.js";

const obs = (
  price: number,
  outboundDate: string,
  observedAt: string,
  extra: Partial<PriceObservation> = {},
): PriceObservation => ({
  priceEurCents: price,
  observedAt,
  outboundDate,
  returnDate: null,
  tripDays: extra.tripDays ?? 10,
  marketingAirline: extra.marketingAirline ?? "AF",
  maxStops: extra.maxStops ?? 0,
});

describe("grouped stats", () => {
  it("monthlyStats agrège par mois de départ et marque la fiabilité", () => {
    const data = [
      ...Array.from({ length: 25 }, (_, i) =>
        obs(140000 + i, "2026-11-05", `2026-09-0${1}T0${0}:00:00Z`),
      ),
      obs(200000, "2026-12-05", "2026-09-02T00:00:00Z"),
    ];
    const stats = monthlyStats(data, { minSampleSize: 20 });
    const nov = stats.find((s) => s.key === "2026-11");
    const dec = stats.find((s) => s.key === "2026-12");
    expect(nov?.reliable).toBe(true);
    expect(dec?.reliable).toBe(false);
    expect(nov!.summary.count).toBe(25);
  });
});

describe("buildAnalyticsReport", () => {
  it("série vide : rapport cohérent, non fiable", () => {
    const r = buildAnalyticsReport([]);
    expect(r.sampleSize).toBe(0);
    expect(r.reliable).toBe(false);
    expect(r.summary).toBeNull();
    expect(r.trend).toBeNull();
    expect(r.best).toBeNull();
    expect(r.bestMonth).toBeNull();
  });

  it("assemble résumé, tendance, meilleur prix et meilleur mois", () => {
    const data: PriceObservation[] = [];
    for (let i = 0; i < 40; i += 1) {
      data.push(
        obs(
          150000 - i * 500,
          "2026-11-10",
          new Date(Date.UTC(2026, 8, 1) + i * 3_600_000).toISOString(),
        ),
      );
    }
    for (let i = 0; i < 40; i += 1) {
      data.push(
        obs(
          175000 - i * 100,
          "2026-12-10",
          new Date(Date.UTC(2026, 8, 1) + i * 3_600_000).toISOString(),
        ),
      );
    }
    const r = buildAnalyticsReport(data, { minSampleSize: 20, overallMinSampleSize: 30 });

    expect(r.reliable).toBe(true);
    expect(r.sampleSize).toBe(80);
    expect(r.summary!.min).toBe(150000 - 39 * 500);
    expect(r.best!.priceEurCents).toBe(150000 - 39 * 500);
    expect(r.trend!.direction).toBe("FALLING");
    expect(r.bestMonth!.key).toBe("2026-11");
    expect(r.byMonth.map((m) => m.key)).toEqual(["2026-11", "2026-12"]);
  });
});
