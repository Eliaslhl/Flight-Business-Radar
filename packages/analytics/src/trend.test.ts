import { describe, expect, it } from "vitest";
import { computePriceTrend } from "./trend.js";

const day = (n: number): string => new Date(Date.UTC(2026, 9, 1) + n * 86_400_000).toISOString();

describe("computePriceTrend", () => {
  it("null en dessous de 2 points ou instants identiques", () => {
    expect(computePriceTrend([])).toBeNull();
    expect(computePriceTrend([{ at: day(0), value: 100 }])).toBeNull();
    expect(
      computePriceTrend([
        { at: day(0), value: 100 },
        { at: day(0), value: 120 },
      ]),
    ).toBeNull();
  });

  it("détecte une baisse linéaire (~ -1000 c€/jour) avec un bon R²", () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ at: day(i), value: 150000 - i * 1000 }));
    const t = computePriceTrend(points)!;
    expect(t.direction).toBe("FALLING");
    expect(t.slopePerDay).toBeCloseTo(-1000, 0);
    expect(t.changePct).toBeCloseTo(-0.06, 3);
    expect(t.r2).toBeCloseTo(1, 5);
  });

  it("classe STABLE quand le bruit domine la pente", () => {
    const points = [140000, 140100, 139900, 140050, 139980, 140020].map((v, i) => ({
      at: day(i),
      value: v,
    }));
    expect(computePriceTrend(points)!.direction).toBe("STABLE");
  });

  it("accepte des epochs ms et trie par instant", () => {
    const t = computePriceTrend([
      { at: Date.UTC(2026, 0, 3), value: 130000 },
      { at: Date.UTC(2026, 0, 1), value: 120000 },
    ])!;
    expect(t.direction).toBe("RISING");
    expect(t.points).toBe(2);
  });
});
