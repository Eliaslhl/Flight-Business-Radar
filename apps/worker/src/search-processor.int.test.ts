import {
  countPriceEventsForSearch,
  countSnapshotsForSearch,
  createSearch,
  getSearch,
  listPriceEventsForSearch,
  listSnapshotsForSearch,
  type DbHandle,
} from "@fbr/database";
import { DEFAULT_DROP_THRESHOLDS } from "@fbr/analytics";
import { MockFlightProvider, ProviderRegistry } from "@fbr/flight-providers";
import { createSilentLogger } from "@fbr/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { processSearchRun, type SearchProcessorDeps } from "./search-processor.js";
import { closeTestDb, getTestDb, hasDb, truncateAll } from "./it-support.js";

const suite = hasDb ? describe : describe.skip;

suite("processSearchRun (intégration Postgres)", () => {
  let handle: DbHandle;

  beforeAll(async () => {
    handle = await getTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });
  beforeEach(async () => {
    await truncateAll(handle);
  });

  const makeSearch = () =>
    createSearch(handle.db, {
      origin: "CDG",
      destinations: ["HND"],
      cabinClass: "BUSINESS",
      departureWindowStart: "2026-11-01",
      departureWindowEnd: "2026-11-30",
      minTripDays: 10,
      maxTripDays: 12,
      maxPriceCents: 200_000,
      targetPriceCents: 130_000,
      currency: "EUR",
    });

  /** Fenêtre + durée fixes ⇒ une seule combinaison ⇒ la même offre est ré-observée à chaque run. */
  const makeSingleComboSearch = () =>
    createSearch(handle.db, {
      origin: "CDG",
      destinations: ["HND"],
      cabinClass: "BUSINESS",
      departureWindowStart: "2026-11-10",
      departureWindowEnd: "2026-11-10",
      minTripDays: 10,
      maxTripDays: 10,
      maxPriceCents: 200_000,
      targetPriceCents: 130_000,
      currency: "EUR",
    });

  const deps = (registry: ProviderRegistry, combinationsPerRun = 6): SearchProcessorDeps => ({
    db: handle.db,
    registry,
    logger: createSilentLogger(),
    combinationsPerRun,
    providerMinIntervalSeconds: 60,
    thresholds: DEFAULT_DROP_THRESHOLDS,
    toBaseCents: (cents) => Promise.resolve(cents), // EUR → identité dans les tests
  });

  it("génère les combinaisons, écrit des snapshots et planifie la prochaine exécution", async () => {
    const search = await makeSearch();
    const registry = new ProviderRegistry([
      new MockFlightProvider({ name: "mock", scenario: "normal", basePriceEur: 1400 }),
    ]);

    const summary = await processSearchRun(deps(registry), {
      searchId: search.id,
      reason: "manual",
    });

    expect(summary.combinations).toBe(6);
    expect(summary.offersKept).toBe(6);
    expect(summary.snapshotsInserted).toBe(6);
    expect(summary.bestPriceCents).toBeGreaterThan(0);
    expect(summary.tier).toBeDefined();

    const fresh = await getSearch(handle.db, search.id);
    expect(fresh?.lastRunAt).not.toBeNull();
    expect(fresh?.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(fresh?.priority);
  });

  it("est append-only : chaque run ajoute des snapshots sans écraser les précédents", async () => {
    const search = await makeSearch();
    const registry = new ProviderRegistry([
      new MockFlightProvider({ name: "mock", scenario: "flash-drop", basePriceEur: 1420 }),
    ]);
    const d = deps(registry, 1); // une seule combinaison → scénario évolue dans le temps

    await processSearchRun(d, { searchId: search.id, reason: "manual" });
    await processSearchRun(d, { searchId: search.id, reason: "manual" });
    await processSearchRun(d, { searchId: search.id, reason: "manual" });
    await processSearchRun(d, { searchId: search.id, reason: "manual" });

    expect(await countSnapshotsForSearch(handle.db, search.id)).toBe(4);

    const prices = (await listSnapshotsForSearch(handle.db, search.id))
      .slice()
      .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())
      .map((s) => s.priceCents);
    // 1420 → ~1350 → ~1190 → ~899 : décroissance marquée sur le 4e run.
    expect(prices[0]).toBe(142_000);
    expect(prices[3]).toBeLessThan(100_000);
  });

  it("dérive des price_events (DROP / FLASH_DROP / RECORD_LOW / RISE) et les persiste", async () => {
    const search = await makeSingleComboSearch();
    const registry = new ProviderRegistry([
      new MockFlightProvider({ name: "mock", scenario: "flash-drop", basePriceEur: 1420 }),
    ]);
    const d = deps(registry, 1);

    let detected = 0;
    let resolved = 0;
    for (let i = 0; i < 5; i += 1) {
      const s = await processSearchRun(d, { searchId: search.id, reason: "manual" });
      detected += s.eventsDetected;
      resolved += s.eventsResolved;
    }

    expect(detected).toBeGreaterThan(0);
    expect(resolved).toBeGreaterThan(0); // le prix remonte au 5e run → baisses résolues
    expect(await countPriceEventsForSearch(handle.db, search.id)).toBe(detected);

    const events = await listPriceEventsForSearch(handle.db, search.id);
    const types = new Set(events.map((e) => e.type));
    expect(types.has("FLASH_DROP")).toBe(true);
    expect(types.has("RECORD_LOW")).toBe(true);
    expect(types.has("RISE")).toBe(true);

    const flash = events.find((e) => e.type === "FLASH_DROP")!;
    expect(flash.dropAmountEurCents).toBeGreaterThan(0);
    expect(flash.dropPct).toBeGreaterThan(0.12);
    expect(flash.newSnapshotId).toBeGreaterThan(0);

    // Les baisses résolues portent une durée.
    const resolvedEvt = events.find((e) => e.resolvedAt !== null);
    expect(resolvedEvt?.durationSeconds).not.toBeNull();
  });

  it("alimente price_eur_cents (identité EUR)", async () => {
    const search = await makeSingleComboSearch();
    const registry = new ProviderRegistry([
      new MockFlightProvider({ name: "mock", basePriceEur: 1400 }),
    ]);
    await processSearchRun(deps(registry, 1), { searchId: search.id, reason: "manual" });
    const [snap] = await listSnapshotsForSearch(handle.db, search.id);
    expect(snap?.priceEurCents).toBe(snap?.priceCents);
  });

  it("ignore un job planifié si la recherche n'est pas active", async () => {
    const search = await makeSearch();
    const registry = new ProviderRegistry([new MockFlightProvider({ name: "mock" })]);
    await handle.sql`UPDATE searches SET status = 'PAUSED' WHERE id = ${search.id}`;

    const summary = await processSearchRun(deps(registry), {
      searchId: search.id,
      reason: "scheduled",
    });
    expect(summary.skipped).toBe("not_active");
    expect(await countSnapshotsForSearch(handle.db, search.id)).toBe(0);
  });

  it("isole les erreurs provider sans échouer le run", async () => {
    const search = await makeSearch();
    const registry = new ProviderRegistry([
      new MockFlightProvider({ name: "ok", scenario: "normal" }),
      new MockFlightProvider({ name: "ko", scenario: "error" }),
    ]);
    const summary = await processSearchRun(deps(registry, 2), {
      searchId: search.id,
      reason: "manual",
    });
    expect(summary.providerErrors).toBeGreaterThan(0);
    expect(summary.snapshotsInserted).toBeGreaterThan(0);
  });
});
