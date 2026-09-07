import { describe, expect, it } from "vitest";
import {
  CDG_LONGHAUL_DESTINATIONS,
  SEED_DESTINATION_CODES,
  WORLD_AIRPORTS,
  countryCodeOf,
  findAirport,
  findSeedAirport,
  flagEmoji,
  isSeedDestination,
  radarDestinationSlice,
  seedCodesForRegion,
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

describe("référentiel WORLD_AIRPORTS (autocomplétion)", () => {
  it("codes IATA valides et uniques, inclut CDG et les destinations seed", () => {
    const codes = WORLD_AIRPORTS.map((a) => a.iata);
    expect(new Set(codes).size).toBe(codes.length);
    for (const a of WORLD_AIRPORTS) {
      expect(a.iata).toMatch(/^[A-Z]{3}$/);
      expect(a.city.length).toBeGreaterThan(0);
      expect(a.country.length).toBeGreaterThan(0);
    }
    expect(codes).toContain("CDG");
    for (const seed of SEED_DESTINATION_CODES) expect(codes).toContain(seed);
  });

  it("findAirport est insensible à la casse", () => {
    expect(findAirport("cdg")).toEqual({ iata: "CDG", city: "Paris", country: "France" });
    expect(findAirport("XXX")).toBeUndefined();
  });
});

describe("pays → code ISO / drapeau", () => {
  it("chaque pays du référentiel a un code ISO 3166-1 alpha-2", () => {
    const countries = new Set([
      ...WORLD_AIRPORTS.map((a) => a.country),
      ...CDG_LONGHAUL_DESTINATIONS.map((a) => a.country),
    ]);
    for (const c of countries) {
      expect(countryCodeOf(c), `code manquant pour « ${c} »`).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("flagEmoji produit un drapeau pour un code valide, «» sinon", () => {
    expect(flagEmoji("FR")).toBe("🇫🇷");
    expect(flagEmoji("jp")).toBe("🇯🇵");
    expect(flagEmoji("")).toBe("");
    expect(flagEmoji("XXX")).toBe("");
  });

  it("seedCodesForRegion filtre la liste seed par région", () => {
    const asia = seedCodesForRegion("ASIA");
    expect(asia.length).toBeGreaterThan(0);
    expect(asia).toContain("HND");
    expect(asia).not.toContain("JFK");
  });
});
