import { describe, expect, it } from "vitest";
import { formatDate, formatEur, formatMonthKey, formatPct, relativeTime } from "./format";

const nbsp = (s: string) => s.replace(/\s/g, " ");

describe("formatEur", () => {
  it("centimes → euros arrondis, avec repli", () => {
    expect(nbsp(formatEur(148_600))).toBe("1 486 €");
    expect(nbsp(formatEur(89_912, true))).toBe("899,12 €");
    expect(formatEur(null)).toBe("—");
    expect(formatEur(undefined)).toBe("—");
    expect(formatEur(Number.NaN)).toBe("—");
  });
});

describe("formatPct", () => {
  it("garde le signe", () => {
    expect(formatPct(-0.1627, 1)).toBe("-16.3 %");
    expect(formatPct(0.05)).toBe("+5 %");
    expect(formatPct(null)).toBe("—");
  });
});

describe("formatDate", () => {
  it("formate en français, repli sur date invalide", () => {
    expect(formatDate("2026-11-10T00:00:00Z")).toMatch(/nov\.? 2026/);
    expect(formatDate("nope")).toBe("—");
    expect(formatDate(null)).toBe("—");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("passé et futur, différentes échelles", () => {
    expect(relativeTime("2026-11-10T11:57:00Z", now)).toContain("min");
    expect(relativeTime("2026-11-10T15:00:00Z", now)).toContain("h");
    expect(relativeTime("2026-11-20T12:00:00Z", now)).toContain("j");
    expect(relativeTime(null)).toBe("—");
  });
});

describe("formatMonthKey", () => {
  it("YYYY-MM → mois abrégé français", () => {
    expect(formatMonthKey("2026-11")).toBe("nov. 2026");
    expect(formatMonthKey("2026-01")).toBe("janv. 2026");
  });
});
