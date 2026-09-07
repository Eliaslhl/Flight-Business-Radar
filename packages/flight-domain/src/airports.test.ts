import { describe, expect, it } from "vitest";
import {
  CDG_LONGHAUL_DESTINATIONS,
  SEED_DESTINATION_CODES,
  findSeedAirport,
  isSeedDestination,
  radarDestinationSlice,
} from "./airports.js";

describe("seed des destinations CDG long-courrier", () => {
  it("contient 40 à 60 aéroports, tous en code IATA valide et unique", () => {
    expect(CDG_LONGHAUL_DESTINATIONS.length).toBeGreaterThanOrEqual(40);
    expect(CDG_LONGHAUL_DESTINATIONS.length).toBeLessThanOrEqual(60);
    for (const a of CDG_LONGHAUL_DESTINATIONS) {
      expect(a.iata).toMatch(/^[A-Z]{3}$/);
    }
    expect(new Set(SEED_DESTINATION_CODES).size).toBe(SEED_DESTINATION_CODES.length);
  });

  it("findSeedAirport / isSeedDestination sont insensibles à la casse", () => {
    expect(findSeedAirport("hnd")?.city).toBe("Tokyo");
    expect(isSeedDestination("jfk")).toBe(true);
    expect(findSeedAirport("XXX")).toBeUndefined();
    expect(isSeedDestination("XXX")).toBe(false);
  });

  it("radarDestinationSlice fait défiler la liste et reboucle", () => {
    const first = radarDestinationSlice(0, 5);
    expect(first).toEqual(SEED_DESTINATION_CODES.slice(0, 5));

    const wrapped = radarDestinationSlice(SEED_DESTINATION_CODES.length - 2, 4);
    expect(wrapped).toHaveLength(4);
    expect(wrapped[0]).toBe(SEED_DESTINATION_CODES.at(-2));
    expect(wrapped[2]).toBe(SEED_DESTINATION_CODES[0]);

    // offset négatif ou géant : normalisé
    expect(radarDestinationSlice(-1, 3)).toEqual(
      radarDestinationSlice(SEED_DESTINATION_CODES.length - 1, 3),
    );
    expect(radarDestinationSlice(0, 999)).toEqual([...SEED_DESTINATION_CODES]);
  });
});
