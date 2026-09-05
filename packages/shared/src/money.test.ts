import { describe, expect, it } from "vitest";
import {
  currencyCode,
  formatMoney,
  fromCents,
  isCurrencyCode,
  money,
  pctChange,
  toCents,
} from "./money.js";

describe("money", () => {
  it("valide les codes devise ISO 4217", () => {
    expect(isCurrencyCode("EUR")).toBe(true);
    expect(isCurrencyCode("eur")).toBe(false);
    expect(isCurrencyCode("EURO")).toBe(false);
    expect(currencyCode("usd")).toBe("USD");
    expect(() => currencyCode("EURO")).toThrow();
  });

  it("convertit unités <-> centimes sans erreur de flottant", () => {
    expect(toCents(1486.5)).toBe(148650);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(fromCents(toCents(1189))).toBe(1189);
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("money() combine montant + devise", () => {
    const m = money(1189, "EUR");
    expect(m.amount).toBe(118900);
    expect(m.currency).toBe("EUR");
  });

  it("formatMoney rend une chaîne localisée en EUR", () => {
    // l'ICU insère des espaces insécables (U+00A0 / U+202F) ; on les normalise.
    const formatted = formatMoney(money(1189, "EUR")).replace(/\s/g, " ");
    expect(formatted).toBe("1 189,00 €");
  });

  it("pctChange calcule la variation relative", () => {
    expect(pctChange(toCents(1420), toCents(1189))).toBeCloseTo(-0.1627, 4);
    expect(pctChange(toCents(0), toCents(100))).toBe(0);
  });
});
