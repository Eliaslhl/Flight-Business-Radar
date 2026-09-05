import { describe, expect, it } from "vitest";
import { airportCodeSchema, iataAirline, iataAirport, isIataAirport } from "./iata.js";

describe("iata", () => {
  it("valide/normalise les codes aéroport (3 lettres)", () => {
    expect(iataAirport("cdg")).toBe("CDG");
    expect(isIataAirport("HND")).toBe(true);
    expect(isIataAirport("HN")).toBe(false);
    expect(() => iataAirport("PARIS")).toThrow();
  });

  it("valide les codes compagnie (2 caractères alphanum)", () => {
    expect(iataAirline("af")).toBe("AF");
    expect(iataAirline("6X")).toBe("6X");
    expect(() => iataAirline("AFR")).toThrow();
  });

  it("le schéma zod rejette et transforme", () => {
    expect(airportCodeSchema.parse("nrt")).toBe("NRT");
    expect(airportCodeSchema.safeParse("nrtX").success).toBe(false);
  });
});
