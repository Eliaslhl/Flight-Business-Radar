import { describe, expect, it } from "vitest";
import {
  computeMonitoringTier,
  computeNextIntervalSeconds,
  DEFAULT_TIER_INTERVALS,
} from "./schedule.js";

describe("computeMonitoringTier", () => {
  it("VERIFY dès qu'une baisse vient d'être détectée", () => {
    expect(computeMonitoringTier({ hasOffers: true, justDetectedDrop: true })).toBe("VERIFY");
  });

  it("HOT sous la cible ou sous le p10 ou grosse baisse", () => {
    expect(
      computeMonitoringTier({
        hasOffers: true,
        bestPriceCents: 110_000,
        targetPriceCents: 120_000,
      }),
    ).toBe("HOT");
    expect(
      computeMonitoringTier({ hasOffers: true, bestPriceCents: 90_000, p10Cents: 95_000 }),
    ).toBe("HOT");
    expect(
      computeMonitoringTier({ hasOffers: true, bestPriceCents: 200_000, recentDropPct: 0.11 }),
    ).toBe("HOT");
  });

  it("WARM proche de la cible, NORMAL sous le budget, COLD sinon", () => {
    expect(
      computeMonitoringTier({
        hasOffers: true,
        bestPriceCents: 132_000,
        targetPriceCents: 120_000,
      }),
    ).toBe("WARM");
    expect(
      computeMonitoringTier({
        hasOffers: true,
        bestPriceCents: 148_000,
        targetPriceCents: 120_000,
        maxPriceCents: 150_000,
      }),
    ).toBe("NORMAL");
    expect(computeMonitoringTier({ hasOffers: false })).toBe("COLD");
  });

  it("resserre d'un cran quand le départ est imminent", () => {
    expect(
      computeMonitoringTier({
        hasOffers: true,
        bestPriceCents: 148_000,
        targetPriceCents: 120_000,
        maxPriceCents: 150_000,
        daysUntilDeparture: 5,
      }),
    ).toBe("WARM"); // NORMAL -> WARM
  });
});

describe("computeNextIntervalSeconds", () => {
  it("mappe le palier vers l'intervalle et applique le plancher provider", () => {
    const { tier, intervalSeconds } = computeNextIntervalSeconds(
      { hasOffers: true, bestPriceCents: 110_000, targetPriceCents: 120_000 },
      { providerMinIntervalSeconds: 300, jitterRatio: 0, rng: () => 0.5 },
    );
    expect(tier).toBe("HOT");
    expect(intervalSeconds).toBe(300); // hot=120 relevé au plancher 300
  });

  it("applique un jitter borné et déterministe via rng", () => {
    const res = computeNextIntervalSeconds(
      { hasOffers: false },
      { jitterRatio: 0.1, rng: () => 1 },
    );
    expect(res.tier).toBe("COLD");
    expect(res.intervalSeconds).toBe(Math.round(DEFAULT_TIER_INTERVALS.cold * 1.1));
  });

  it("respecte les intervalles surchargés", () => {
    const res = computeNextIntervalSeconds(
      { hasOffers: false },
      { intervals: { cold: 7200 }, jitterRatio: 0, rng: () => 0.5 },
    );
    expect(res.intervalSeconds).toBe(7200);
  });
});
