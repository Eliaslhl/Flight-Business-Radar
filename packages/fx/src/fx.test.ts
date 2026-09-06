import { describe, expect, it, vi } from "vitest";
import { FixedFxProvider, FrankfurterFxProvider } from "./providers.js";
import { MemoryRateStore } from "./memory-store.js";
import { FxService } from "./service.js";
import { type FxProvider } from "./types.js";

const at = new Date("2026-11-10T00:00:00Z");

describe("FixedFxProvider", () => {
  it("renvoie les taux de sa base et rejette une autre base", async () => {
    const p = new FixedFxProvider("EUR", { usd: 1.1, gbp: 0.85 });
    await expect(p.fetchRates("EUR")).resolves.toEqual({ EUR: 1, USD: 1.1, GBP: 0.85 });
    await expect(p.fetchRates("USD")).rejects.toThrow();
  });
});

describe("FrankfurterFxProvider", () => {
  it("parse la réponse et ajoute la base à 1", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ base: "EUR", date: "2026-11-10", rates: { USD: 1.08, JPY: 165.2 } }),
    });
    const p = new FrankfurterFxProvider({ fetchImpl });
    await expect(p.fetchRates("eur")).resolves.toEqual({ EUR: 1, USD: 1.08, JPY: 165.2 });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.frankfurter.dev/v1/latest?base=EUR");
  });

  it("lève une ProviderError retryable sur erreur HTTP", async () => {
    const p = new FrankfurterFxProvider({
      fetchImpl: () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    });
    await expect(p.fetchRates("EUR")).rejects.toMatchObject({ retryable: true });
  });
});

describe("FxService", () => {
  const provider = (): FxProvider => new FixedFxProvider("EUR", { USD: 1.25, GBP: 0.8 });

  it("EUR→EUR = identité, sans appel provider", async () => {
    const spy = vi.spyOn(provider(), "fetchRates");
    const svc = new FxService({ provider: provider(), store: new MemoryRateStore(), base: "EUR" });
    expect(await svc.toBaseCents(148_600, "EUR", at)).toBe(148_600);
    expect(spy).not.toHaveBeenCalled();
  });

  it("convertit USD→EUR et met le taux en cache (1 seul fetch)", async () => {
    const p = provider();
    const fetchSpy = vi.spyOn(p, "fetchRates");
    const svc = new FxService({ provider: p, store: new MemoryRateStore(), base: "EUR" });

    // 1 USD = 1/1.25 EUR = 0.8 EUR ; 125000 c$ -> 100000 c€
    expect(await svc.toBaseCents(125_000, "USD", at)).toBe(100_000);
    expect(await svc.toBaseCents(250_000, "USD", at)).toBe(200_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("dérive un taux croisé GBP→USD via la base", async () => {
    const svc = new FxService({ provider: provider(), store: new MemoryRateStore(), base: "EUR" });
    // GBP→USD = rate(EUR→USD) / rate(EUR→GBP) = 1.25 / 0.8 = 1.5625
    expect(await svc.getRate("GBP", "USD", at)).toBeCloseTo(1.5625, 6);
  });
});
