import { createSearch, listDueSearches, type DbHandle } from "@fbr/database";
import {
  createQueueConnection,
  createSearchQueue,
  type Queue,
  type SearchRunJobData,
} from "@fbr/queue";
import { createSilentLogger } from "@fbr/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Redis } from "@fbr/queue";
import { createScheduler } from "./scheduler.js";
import { closeTestDb, getTestDb, hasDb, hasRedis, truncateAll } from "./it-support.js";

const suite = hasDb && hasRedis ? describe : describe.skip;

suite("createScheduler (intégration Postgres + Redis)", () => {
  let handle: DbHandle;
  let connection: Redis;
  let queue: Queue<SearchRunJobData>;

  beforeAll(async () => {
    handle = await getTestDb();
    connection = createQueueConnection(process.env.REDIS_URL!);
    queue = createSearchQueue(connection);
  });

  afterAll(async () => {
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
    await connection.quit();
    await closeTestDb();
  });

  beforeEach(async () => {
    await truncateAll(handle);
    await queue.obliterate({ force: true }).catch(() => undefined);
  });

  it("enfile un job pour chaque recherche due et pose un bail sur next_run_at", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const search = await createSearch(handle.db, {
      origin: "CDG",
      destinations: ["HND"],
      cabinClass: "BUSINESS",
      departureWindowStart: "2026-11-01",
      departureWindowEnd: "2026-11-30",
      minTripDays: 10,
      maxTripDays: 12,
      currency: "EUR",
    });
    await handle.sql`UPDATE searches SET next_run_at = ${past} WHERE id = ${search.id}`;

    const scheduler = createScheduler({
      db: handle.db,
      queue,
      logger: createSilentLogger(),
      intervalMs: 60_000,
      leaseSeconds: 120,
    });

    const enqueued = await scheduler.tick();
    expect(enqueued).toBe(1);

    const counts = await queue.getJobCounts("waiting", "delayed", "active");
    expect((counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0)).toBe(1);

    // Bail posé → la recherche n'est plus « due ».
    const stillDue = await listDueSearches(handle.db, new Date(), 10);
    expect(stillDue).toHaveLength(0);

    // Second tick immédiat : aucun nouveau job.
    expect(await scheduler.tick()).toBe(0);
  });
});
