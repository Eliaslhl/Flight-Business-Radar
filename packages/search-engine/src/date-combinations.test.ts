import { describe, expect, it } from "vitest";
import { generateDateCombinations } from "./date-combinations.js";

const window = {
  departureWindowStart: "2026-10-01",
  departureWindowEnd: "2026-12-15",
  minTripDays: 7,
  maxTripDays: 14,
};

describe("generateDateCombinations", () => {
  it("produit des combinaisons cohérentes (retour = départ + durée)", () => {
    const combos = generateDateCombinations(window, { maxCombinations: 40 });
    expect(combos.length).toBeGreaterThan(0);
    expect(combos.length).toBeLessThanOrEqual(40);
    for (const c of combos) {
      expect(c.tripDays).toBeGreaterThanOrEqual(7);
      expect(c.tripDays).toBeLessThanOrEqual(14);
      const days = Math.round(
        (Date.parse(`${c.returnDate}T00:00:00Z`) - Date.parse(`${c.outboundDate}T00:00:00Z`)) /
          86_400_000,
      );
      expect(days).toBe(c.tripDays);
      expect(c.priorityScore).toBeGreaterThanOrEqual(0);
      expect(c.priorityScore).toBeLessThanOrEqual(1);
    }
  });

  it("déduplique et respecte le plafond même avec des pas de 1", () => {
    const combos = generateDateCombinations(window, {
      outboundStepDays: 1,
      tripLengthStepDays: 1,
      maxCombinations: 25,
    });
    expect(combos).toHaveLength(25);
    const keys = new Set(combos.map((c) => `${c.outboundDate}|${c.returnDate}`));
    expect(keys.size).toBe(25);
  });

  it("trie par score décroissant et privilégie les durées centrales", () => {
    const combos = generateDateCombinations(window, { maxCombinations: 50 });
    for (let i = 1; i < combos.length; i += 1) {
      expect(combos[i - 1]!.priorityScore).toBeGreaterThanOrEqual(combos[i]!.priorityScore);
    }
    const top = combos.slice(0, 10);
    const avgTripDays = top.reduce((s, c) => s + c.tripDays, 0) / top.length;
    expect(avgTripDays).toBeGreaterThan(8);
    expect(avgTripDays).toBeLessThan(13);
  });

  it("gère une fenêtre d'un seul jour et une durée fixe", () => {
    const combos = generateDateCombinations({
      departureWindowStart: "2026-11-10",
      departureWindowEnd: "2026-11-10",
      minTripDays: 10,
      maxTripDays: 10,
    });
    expect(combos).toHaveLength(1);
    expect(combos[0]).toMatchObject({
      outboundDate: "2026-11-10",
      returnDate: "2026-11-20",
      tripDays: 10,
    });
  });

  it("rejette une fenêtre inversée ou une durée invalide", () => {
    expect(() =>
      generateDateCombinations({ ...window, departureWindowStart: "2026-12-20" }),
    ).toThrow();
    expect(() => generateDateCombinations({ ...window, minTripDays: 0 })).toThrow();
    expect(() => generateDateCombinations({ ...window, minTripDays: 20 })).toThrow();
  });
});
