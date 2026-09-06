import { describe, expect, it } from "vitest";
import { computeSearchPriority } from "./priority.js";

describe("computeSearchPriority", () => {
  it("HIGH quand le meilleur prix atteint la cible", () => {
    expect(
      computeSearchPriority({
        daysUntilWindowStart: 40,
        hasOffers: true,
        bestPriceCents: 118_000,
        targetPriceCents: 120_000,
      }),
    ).toBe("HIGH");
  });

  it("HIGH sur une baisse récente marquée, même loin de la cible", () => {
    expect(
      computeSearchPriority({
        daysUntilWindowStart: 90,
        hasOffers: true,
        bestPriceCents: 160_000,
        targetPriceCents: 120_000,
        recentDropPct: 0.12,
      }),
    ).toBe("HIGH");
  });

  it("MEDIUM quand des offres existent sous le budget mais loin de la cible", () => {
    expect(
      computeSearchPriority({
        daysUntilWindowStart: 60,
        hasOffers: true,
        bestPriceCents: 145_000,
        targetPriceCents: 120_000,
        maxPriceCents: 150_000,
      }),
    ).toBe("MEDIUM");
  });

  it("MEDIUM quand le départ est proche même sans offre", () => {
    expect(computeSearchPriority({ daysUntilWindowStart: 10, hasOffers: false })).toBe("MEDIUM");
  });

  it("LOW par défaut (pas d'offre, départ lointain)", () => {
    expect(computeSearchPriority({ daysUntilWindowStart: 120, hasOffers: false })).toBe("LOW");
  });
});
