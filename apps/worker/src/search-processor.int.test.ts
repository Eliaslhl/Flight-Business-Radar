import {
  countSnapshotsForSearch,
  createSearch,
  getSearch,
  listSnapshotsForSearch,
  type DbHandle,
} from "@fbr/database";
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

  const deps = (registry: ProviderRegistry, combinationsPerRun = 6): SearchProcessorDeps => ({
    db: handle.db,
    registry,
    logger: createSilentLogger(),
    combinationsPerRun,
    providerMinIntervalSeconds: 60,
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
