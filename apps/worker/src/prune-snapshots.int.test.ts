import {
  countSnapshotsForSearch,
  createSearch,
  insertSnapshot,
  pruneOldSnapshots,
  upsertOffer,
  type DbHandle,
} from "@fbr/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, getTestDb, hasDb, truncateAll } from "./it-support.js";

const suite = hasDb ? describe : describe.skip;

suite("pruneOldSnapshots (intégration Postgres)", () => {
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

  const seedOffer = async (searchId: string) => {
    const { id } = await upsertOffer(handle.db, {
      fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
      origin: "CDG",
      destination: "HND",
      cabinClass: "ECONOMY",
      outboundDate: "2026-11-10",
      returnDate: "2026-11-20",
      tripDays: 10,
      marketingAirline: "AF",
      maxStops: 1,
      payload: { searchId },
    });
    return id;
  };

  const addSnapshot = (offerId: string, searchId: string, observedAt: Date) =>
    insertSnapshot(handle.db, {
      flightOfferId: offerId,
      searchId,
      provider: "mock",
      priceCents: 50_000,
      currency: "EUR",
      priceEurCents: 50_000,
      availability: "UNKNOWN",
      observedAt,
    });

  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  it("supprime les snapshots plus vieux que la rétention et garde les récents", async () => {
    const search = await createSearch(handle.db, {
      origin: "CDG",
      destinations: ["HND"],
      cabinClass: "ECONOMY",
      departureWindowStart: "2026-11-01",
      departureWindowEnd: "2026-11-30",
      minTripDays: 10,
      maxTripDays: 12,
      currency: "EUR",
    });
    const offerId = await seedOffer(search.id);

    await addSnapshot(offerId, search.id, daysAgo(200));
    await addSnapshot(offerId, search.id, daysAgo(181));
    await addSnapshot(offerId, search.id, daysAgo(10));
    await addSnapshot(offerId, search.id, daysAgo(0));

    const deleted = await pruneOldSnapshots(handle.db, 180);
    expect(deleted).toBe(2);
    expect(await countSnapshotsForSearch(handle.db, search.id)).toBe(2);
  });

  it("no-op quand la rétention est nulle ou négative", async () => {
    const search = await createSearch(handle.db, {
      origin: "CDG",
      destinations: ["HND"],
      cabinClass: "ECONOMY",
      departureWindowStart: "2026-11-01",
      departureWindowEnd: "2026-11-30",
      minTripDays: 10,
      maxTripDays: 12,
      currency: "EUR",
    });
    const offerId = await seedOffer(search.id);
    await addSnapshot(offerId, search.id, daysAgo(999));

    expect(await pruneOldSnapshots(handle.db, 0)).toBe(0);
    expect(await pruneOldSnapshots(handle.db, -5)).toBe(0);
    expect(await countSnapshotsForSearch(handle.db, search.id)).toBe(1);
  });
});
