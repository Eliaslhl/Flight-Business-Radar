import { describe, expect, it } from "vitest";
import { flightSearchRequestSchema, isRadarSearch } from "./search-request.js";

const base = {
  origin: "CDG",
  destinations: ["HND"],
  departureWindow: { start: "2026-10-01", end: "2026-12-31" },
  tripDuration: { minDays: 7, maxDays: 14 },
  maxPrice: { amount: 150000, currency: "EUR" },
  targetPrice: { amount: 120000, currency: "EUR" },
};

describe("flightSearchRequestSchema", () => {
  it("applique les défauts (cabine BUSINESS, 1 adulte, maxStops 1, EUR)", () => {
    const r = flightSearchRequestSchema.parse(base);
    expect(r.cabinClass).toBe("BUSINESS");
    expect(r.passengers).toEqual({ adults: 1 });
    expect(r.maxStops).toBe(1);
    expect(r.currency).toBe("EUR");
    expect(isRadarSearch(r)).toBe(false);
  });

  it("reconnaît le mode Radar quand destinations est vide", () => {
    const r = flightSearchRequestSchema.parse({ ...base, destinations: [] });
    expect(isRadarSearch(r)).toBe(true);
  });

  it("rejette une fenêtre de dates inversée", () => {
    const res = flightSearchRequestSchema.safeParse({
      ...base,
      departureWindow: { start: "2026-12-31", end: "2026-10-01" },
    });
    expect(res.success).toBe(false);
  });

  it("rejette minDays > maxDays et target > max", () => {
    expect(
      flightSearchRequestSchema.safeParse({ ...base, tripDuration: { minDays: 20, maxDays: 7 } })
        .success,
    ).toBe(false);
    expect(
      flightSearchRequestSchema.safeParse({
        ...base,
        targetPrice: { amount: 200000, currency: "EUR" },
      }).success,
    ).toBe(false);
  });

  it("rejette une compagnie à la fois préférée et exclue", () => {
    const res = flightSearchRequestSchema.safeParse({
      ...base,
      preferredAirlines: ["AF"],
      excludedAirlines: ["AF"],
    });
    expect(res.success).toBe(false);
  });
});
