import { describe, expect, it } from "vitest";
import { addDays, compareIsoDate, daysBetween, isIsoDate, isoDate } from "./dates.js";

describe("dates", () => {
  it("valide le format et rejette les dates impossibles", () => {
    expect(isIsoDate("2026-11-10")).toBe(true);
    expect(isIsoDate("2026-2-9")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(() => isoDate("nope")).toThrow();
  });

  it("daysBetween compte les jours entiers (y compris à travers un mois)", () => {
    expect(daysBetween(isoDate("2026-11-10"), isoDate("2026-11-20"))).toBe(10);
    expect(daysBetween(isoDate("2026-10-28"), isoDate("2026-11-04"))).toBe(7);
    expect(daysBetween(isoDate("2026-11-20"), isoDate("2026-11-10"))).toBe(-10);
  });

  it("addDays reste une date calendaire valide", () => {
    expect(addDays(isoDate("2026-11-10"), 12)).toBe("2026-11-22");
    expect(addDays(isoDate("2026-12-28"), 5)).toBe("2027-01-02");
  });

  it("compareIsoDate ordonne lexicographiquement (== chronologiquement)", () => {
    expect(compareIsoDate(isoDate("2026-01-01"), isoDate("2026-12-31"))).toBe(-1);
    expect(compareIsoDate(isoDate("2026-05-05"), isoDate("2026-05-05"))).toBe(0);
  });
});
