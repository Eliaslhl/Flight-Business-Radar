import { describe, expect, it } from "vitest";
import { mean, median, percentile, stdDev, summarize } from "./descriptive.js";

describe("descriptive", () => {
  it("mean / median / stdDev sur une série connue", () => {
    const v = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(v)).toBe(5);
    expect(median(v)).toBe(4.5);
    expect(stdDev(v)).toBeCloseTo(2, 5);
  });

  it("percentile interpole linéairement et borne p", () => {
    const s = [10, 20, 30, 40, 50];
    expect(percentile(s, 0)).toBe(10);
    expect(percentile(s, 1)).toBe(50);
    expect(percentile(s, 0.5)).toBe(30);
    expect(percentile(s, 0.25)).toBe(20);
    expect(percentile(s, 2)).toBe(50);
  });

  it("summarize renvoie null pour une série vide", () => {
    expect(summarize([])).toBeNull();
  });

  it("summarize agrège tout et calcule la volatilité", () => {
    const s = summarize([100, 100, 100, 100])!;
    expect(s.count).toBe(4);
    expect(s.min).toBe(100);
    expect(s.max).toBe(100);
    expect(s.stdDev).toBe(0);
    expect(s.coefficientOfVariation).toBe(0);

    const s2 = summarize([120000, 130000, 145000, 118000, 160000])!;
    expect(s2.count).toBe(5);
    expect(s2.min).toBe(118000);
    expect(s2.max).toBe(160000);
    expect(s2.mean).toBeCloseTo(134600, 0);
    expect(s2.coefficientOfVariation).toBeGreaterThan(0);
  });
});
