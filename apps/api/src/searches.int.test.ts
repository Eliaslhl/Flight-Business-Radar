import { loadConfig } from "@fbr/config";
import { insertSnapshots, upsertOffer } from "@fbr/database";
import { createSilentLogger } from "@fbr/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type ApiInstance } from "./app.js";
import { closeTestDb, getTestDb, hasDb, truncateAll } from "./it-support.js";
import type { DbHandle } from "@fbr/database";

const suite = hasDb ? describe : describe.skip;

const config = loadConfig({
  NODE_ENV: "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://fbr:fbr@localhost:5432/fbr",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
});

const validBody = {
  label: "CDG → Tokyo Business",
  origin: "CDG",
  destinations: ["HND"],
  departureWindow: { start: "2026-11-01", end: "2026-11-30" },
  tripDuration: { minDays: 10, maxDays: 14 },
  maxPriceCents: 200_000,
  targetPriceCents: 130_000,
};

suite("API /api/searches (intégration Postgres)", () => {
  let handle: DbHandle;
  let app: ApiInstance;

  beforeAll(async () => {
    handle = await getTestDb();
    app = buildApp({ config, logger: createSilentLogger(), db: handle });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await closeTestDb();
  });
  beforeEach(async () => {
    await truncateAll(handle);
  });

  it("crée, liste, lit, active/pause et supprime une recherche", async () => {
    const created = await app.inject({ method: "POST", url: "/api/searches", payload: validBody });
    expect(created.statusCode).toBe(201);
    const body = created.json<{ id: string; status: string; dateCombinations: number }>();
    expect(body.status).toBe("ACTIVE");
    expect(body.dateCombinations).toBeGreaterThan(0);

    const list = await app.inject({ method: "GET", url: "/api/searches" });
    expect(list.json<{ searches: unknown[] }>().searches).toHaveLength(1);

    const one = await app.inject({ method: "GET", url: `/api/searches/${body.id}` });
    expect(one.statusCode).toBe(200);

    const paused = await app.inject({ method: "POST", url: `/api/searches/${body.id}/pause` });
    expect(paused.json<{ status: string }>().status).toBe("PAUSED");

    const activated = await app.inject({
      method: "POST",
      url: `/api/searches/${body.id}/activate`,
    });
    expect(activated.json<{ status: string }>().status).toBe("ACTIVE");

    const flights = await app.inject({ method: "GET", url: `/api/searches/${body.id}/flights` });
    expect(flights.json<{ flights: unknown[] }>().flights).toEqual([]);

    const prices = await app.inject({ method: "GET", url: `/api/searches/${body.id}/prices` });
    expect(prices.json<{ prices: unknown[] }>().prices).toEqual([]);

    const del = await app.inject({ method: "DELETE", url: `/api/searches/${body.id}` });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/searches/${body.id}` })).statusCode).toBe(
      404,
    );
  });

  it("rejette un corps invalide en 400 avec le détail des erreurs", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/searches",
      payload: { ...validBody, tripDuration: { minDays: 20, maxDays: 7 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: string }>().error).toBe("VALIDATION_FAILED");
  });

  it("POST /run répond 503 quand la file n'est pas branchée", async () => {
    const created = await app.inject({ method: "POST", url: "/api/searches", payload: validBody });
    const { id } = created.json<{ id: string }>();
    const run = await app.inject({ method: "POST", url: `/api/searches/${id}/run` });
    expect(run.statusCode).toBe(503);
  });

  it("/analytics agrège les observations et /events part vide", async () => {
    const created = await app.inject({ method: "POST", url: "/api/searches", payload: validBody });
    const { id } = created.json<{ id: string }>();

    const { id: offerId } = await upsertOffer(handle.db, {
      fingerprint: `fbr_${id.slice(0, 12)}`,
      origin: "CDG",
      destination: "HND",
      cabinClass: "BUSINESS",
      outboundDate: "2026-11-10",
      returnDate: "2026-11-20",
      tripDays: 10,
      marketingAirline: "AF",
      maxStops: 0,
      payload: {},
    });
    const prices = [150_000, 145_000, 140_000, 138_000, 132_000, 128_000];
    await insertSnapshots(
      handle.db,
      prices.map((p, i) => ({
        flightOfferId: offerId,
        searchId: id,
        provider: "mock",
        priceCents: p,
        currency: "EUR",
        priceEurCents: p,
        availability: "AVAILABLE" as const,
        observedAt: new Date(Date.UTC(2026, 8, 1) + i * 3_600_000),
      })),
    );

    const analytics = await app.inject({ method: "GET", url: `/api/searches/${id}/analytics` });
    const report = analytics.json<{
      sampleSize: number;
      currency: string;
      summary: { min: number; max: number } | null;
      trend: { direction: string } | null;
      best: { priceEurCents: number } | null;
      byMonth: { key: string }[];
    }>();
    expect(report.currency).toBe("EUR");
    expect(report.sampleSize).toBe(6);
    expect(report.summary?.min).toBe(128_000);
    expect(report.summary?.max).toBe(150_000);
    expect(report.trend?.direction).toBe("FALLING");
    expect(report.best?.priceEurCents).toBe(128_000);
    expect(report.byMonth.map((m) => m.key)).toEqual(["2026-11"]);

    const events = await app.inject({ method: "GET", url: `/api/searches/${id}/events` });
    expect(events.json<{ events: unknown[] }>().events).toEqual([]);
  });

  it("404 sur une recherche inconnue", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/searches/00000000-0000-0000-0000-0000000000ff",
    });
    expect(res.statusCode).toBe(404);
  });
});
