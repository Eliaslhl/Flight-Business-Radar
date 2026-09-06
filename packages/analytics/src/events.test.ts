import { describe, expect, it } from "vitest";
import { analyzeDrop, derivePriceEvents, type SnapshotRef } from "./events.js";

const snap = (id: number, price: number, minutesAgo = 0): SnapshotRef => ({
  id,
  priceEurCents: price,
  observedAt: new Date(Date.UTC(2026, 10, 10, 12, 0) - minutesAgo * 60_000).toISOString(),
});

describe("analyzeDrop", () => {
  it("calcule montant, pourcentage et écart temporel (positif = baisse)", () => {
    const a = analyzeDrop(snap(1, 142000, 30), snap(2, 118900, 0))!;
    expect(a.dropAmountEurCents).toBe(23100);
    expect(a.dropPct).toBeCloseTo(0.1627, 4);
    expect(a.minutesBetween).toBe(30);
  });
});

describe("derivePriceEvents", () => {
  const types = (evts: ReturnType<typeof derivePriceEvents>) => evts.map((e) => e.type).sort();

  it("FLASH_DROP + DROP quand baisse forte et rapide", () => {
    const evts = derivePriceEvents({
      previous: snap(1, 142000, 20),
      current: snap(2, 89900, 0),
      observationCount: 12,
    });
    expect(types(evts)).toEqual(["DROP", "FLASH_DROP"]);
    expect(evts.find((e) => e.type === "FLASH_DROP")?.dropAmountEurCents).toBe(52100);
  });

  it("DROP simple (baisse modérée) sans FLASH_DROP", () => {
    const evts = derivePriceEvents({
      previous: snap(1, 142000, 20),
      current: snap(2, 133000, 0),
      observationCount: 12,
    });
    expect(types(evts)).toEqual(["DROP"]);
  });

  it("pas de FLASH_DROP si la fenêtre temporelle est trop large", () => {
    const evts = derivePriceEvents({
      previous: snap(1, 142000, 240),
      current: snap(2, 89900, 0),
      observationCount: 12,
    });
    expect(types(evts)).toEqual(["DROP"]);
  });

  it("RISE quand le prix remonte nettement", () => {
    const evts = derivePriceEvents({
      previous: snap(1, 120000, 20),
      current: snap(2, 138000, 0),
      observationCount: 12,
    });
    expect(types(evts)).toContain("RISE");
  });

  it("RECORD_LOW / TARGET_HIT / UNUSUAL selon l'historique", () => {
    const evts = derivePriceEvents({
      previous: snap(1, 150000, 60),
      current: snap(2, 110000, 0),
      minEverEurCents: 115000,
      p10EurCents: 118000,
      targetEurCents: 120000,
      observationCount: 40,
    });
    expect(types(evts)).toEqual(expect.arrayContaining(["RECORD_LOW", "TARGET_HIT", "UNUSUAL"]));
  });

  it("UNUSUAL ignoré si l'échantillon est trop petit", () => {
    const evts = derivePriceEvents({
      current: snap(2, 110000, 0),
      p10EurCents: 118000,
      observationCount: 8,
    });
    expect(types(evts)).not.toContain("UNUSUAL");
  });

  it("aucun événement pour un prix hors bande de plausibilité", () => {
    expect(
      derivePriceEvents({
        previous: snap(1, 142000, 10),
        current: snap(2, 500, 0),
        minEverEurCents: 100000,
        observationCount: 50,
      }),
    ).toEqual([]);
  });

  it("premier snapshot (sans précédent) : pas de DROP mais RECORD_LOW possible", () => {
    const evts = derivePriceEvents({
      current: snap(1, 100000, 0),
      minEverEurCents: 120000,
      observationCount: 1,
    });
    expect(types(evts)).toEqual(["RECORD_LOW"]);
    expect(evts[0]?.previousSnapshotId).toBeNull();
  });
});
