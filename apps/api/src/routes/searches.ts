import {
  createSearch,
  deleteSearch,
  getSearch,
  listNotificationsForSearch,
  listObservationsForAnalytics,
  listPriceEventsForSearch,
  listProviderRequests,
  listSearches,
  listSearchFlights,
  listSnapshotsForSearch,
  replaceCombinations,
  setSearchStatus,
  updateSearchSchedule,
  DEV_USER_ID,
  type Database,
  type SearchRow,
} from "@fbr/database";
import {
  buildAnalyticsReport,
  buildRecommendationReport,
  type PriceObservation,
  type RecommendationObservation,
} from "@fbr/analytics";
import { enqueueSearchRun, type Queue, type SearchRunJobData } from "@fbr/queue";
import { generateDateCombinations } from "@fbr/search-engine";
import { type Logger } from "@fbr/shared";
import { createSearchBodySchema } from "../schemas.js";
import { type ApiInstance } from "../types.js";

export interface SearchRoutesDeps {
  readonly db: Database;
  readonly queue?: Queue<SearchRunJobData>;
  readonly logger: Logger;
  readonly analyticsMinSample: number;
}

const toDto = (row: SearchRow) => ({
  id: row.id,
  label: row.label,
  origin: row.origin,
  destinations: row.destinations,
  cabinClass: row.cabinClass,
  departureWindow: { start: row.departureWindowStart, end: row.departureWindowEnd },
  tripDuration: { minDays: row.minTripDays, maxDays: row.maxTripDays },
  maxStops: row.maxStops,
  maxPriceCents: row.maxPriceCents,
  targetPriceCents: row.targetPriceCents,
  currency: row.currency,
  preferredAirlines: row.preferredAirlines,
  excludedAirlines: row.excludedAirlines,
  status: row.status,
  priority: row.priority,
  intervalSeconds: row.intervalSeconds,
  nextRunAt: row.nextRunAt.toISOString(),
  lastRunAt: row.lastRunAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export const registerSearchRoutes = (app: ApiInstance, deps: SearchRoutesDeps): void => {
  const { db } = deps;

  app.post("/api/searches", async (request, reply) => {
    const parsed = createSearchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "VALIDATION_FAILED",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const body = parsed.data;
    const created = await createSearch(db, {
      userId: DEV_USER_ID,
      label: body.label ?? null,
      origin: body.origin,
      destinations: body.destinations,
      cabinClass: body.cabinClass,
      departureWindowStart: body.departureWindow.start,
      departureWindowEnd: body.departureWindow.end,
      minTripDays: body.tripDuration.minDays,
      maxTripDays: body.tripDuration.maxDays,
      maxPriceCents: body.maxPriceCents ?? null,
      targetPriceCents: body.targetPriceCents ?? null,
      currency: body.currency,
      maxStops: body.maxStops,
      preferredAirlines: body.preferredAirlines,
      excludedAirlines: body.excludedAirlines,
      ...(body.intervalSeconds !== undefined ? { intervalSeconds: body.intervalSeconds } : {}),
    });

    const combos = generateDateCombinations({
      departureWindowStart: created.departureWindowStart,
      departureWindowEnd: created.departureWindowEnd,
      minTripDays: created.minTripDays,
      maxTripDays: created.maxTripDays,
    });
    await replaceCombinations(
      db,
      created.id,
      combos.map((c) => ({
        outboundDate: c.outboundDate,
        returnDate: c.returnDate,
        tripDays: c.tripDays,
        priorityScore: c.priorityScore,
      })),
    );

    return reply.code(201).send({ ...toDto(created), dateCombinations: combos.length });
  });

  app.get("/api/searches", async () => {
    const rows = await listSearches(db, { userId: DEV_USER_ID });
    return { searches: rows.map(toDto) };
  });

  app.get("/api/searches/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getSearch(db, id);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    return toDto(row);
  });

  app.delete("/api/searches/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await deleteSearch(db, id);
    return ok ? reply.code(204).send() : reply.code(404).send({ error: "NOT_FOUND" });
  });

  app.post("/api/searches/:id/activate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await setSearchStatus(db, id, "ACTIVE");
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    await updateSearchSchedule(db, id, { nextRunAt: new Date() });
    const fresh = await getSearch(db, id);
    return toDto(fresh ?? row);
  });

  app.post("/api/searches/:id/pause", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await setSearchStatus(db, id, "PAUSED");
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    return toDto(row);
  });

  app.post("/api/searches/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getSearch(db, id);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    if (!deps.queue) return reply.code(503).send({ error: "QUEUE_UNAVAILABLE" });
    const job = await enqueueSearchRun(deps.queue, { searchId: id, reason: "manual" });
    return reply.code(202).send({ enqueued: true, jobId: job.id });
  });

  app.get("/api/searches/:id/flights", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getSearch(db, id);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    const flights = await listSearchFlights(db, id, { limit: 200 });
    return {
      flights: flights.map((f) => ({
        fingerprint: f.offer.fingerprint,
        origin: f.offer.origin,
        destination: f.offer.destination,
        cabinClass: f.offer.cabinClass,
        outboundDate: f.offer.outboundDate,
        returnDate: f.offer.returnDate,
        tripDays: f.offer.tripDays,
        marketingAirline: f.offer.marketingAirline,
        maxStops: f.offer.maxStops,
        latestPriceCents: f.latestPriceCents,
        currency: f.currency,
        availability: f.availability,
        observedAt: f.observedAt.toISOString(),
        offer: f.offer.payload,
      })),
    };
  });

  app.get("/api/searches/:id/prices", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getSearch(db, id);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 500) || 500, 1), 5000);
    const snapshots = await listSnapshotsForSearch(db, id, { limit });
    return {
      prices: snapshots.map((s) => ({
        id: s.id,
        flightOfferId: s.flightOfferId,
        provider: s.provider,
        priceCents: s.priceCents,
        priceEurCents: s.priceEurCents,
        currency: s.currency,
        availability: s.availability,
        status: s.status,
        observedAt: s.observedAt.toISOString(),
      })),
    };
  });

  app.get("/api/searches/:id/analytics", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getSearch(db, id);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    const rows = await listObservationsForAnalytics(db, id);
    const observations: PriceObservation[] = rows.map((o) => ({
      priceEurCents: o.priceEurCents,
      observedAt: o.observedAt.toISOString(),
      outboundDate: o.outboundDate,
      returnDate: o.returnDate,
      tripDays: o.tripDays,
      marketingAirline: o.marketingAirline,
      maxStops: o.maxStops,
    }));
    return buildAnalyticsReport(observations, {
      minSampleSize: deps.analyticsMinSample,
      overallMinSampleSize: deps.analyticsMinSample,
    });
  });

  app.get("/api/searches/:id/recommendations", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getSearch(db, id);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    const rows = await listObservationsForAnalytics(db, id);
    const observations: RecommendationObservation[] = rows.map((o) => ({
      priceEurCents: o.priceEurCents,
      observedAt: o.observedAt.toISOString(),
      outboundDate: o.outboundDate,
      returnDate: o.returnDate,
      tripDays: o.tripDays,
      destination: o.destination,
    }));
    return buildRecommendationReport(observations, {
      departureWindowStart: row.departureWindowStart,
      targetEurCents: row.targetPriceCents,
      maxEurCents: row.maxPriceCents,
      minSampleSize: deps.analyticsMinSample,
      radar: row.destinations.length === 0,
    });
  });

  app.get("/api/searches/:id/notifications", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getSearch(db, id);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 200) || 200, 1), 2000);
    const rows = await listNotificationsForSearch(db, id, { limit });
    return {
      notifications: rows.map((n) => ({
        id: n.id,
        alertId: n.alertId,
        priceEventId: n.priceEventId,
        channel: n.channel,
        status: n.status,
        subject: n.subject,
        body: n.body,
        dedupeKey: n.dedupeKey,
        createdAt: n.createdAt.toISOString(),
        sentAt: n.sentAt?.toISOString() ?? null,
        error: n.error,
      })),
    };
  });

  app.get("/api/searches/:id/provider-requests", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getSearch(db, id);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    const query = request.query as { limit?: string; provider?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 200) || 200, 1), 2000);
    const rows = await listProviderRequests(db, {
      searchId: id,
      limit,
      ...(query.provider ? { provider: query.provider } : {}),
    });
    return {
      providerRequests: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        ok: r.ok,
        offerCount: r.offerCount,
        latencyMs: r.latencyMs,
        errorCode: r.errorCode,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

  app.get("/api/searches/:id/events", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await getSearch(db, id);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 200) || 200, 1), 2000);
    const events = await listPriceEventsForSearch(db, id, { limit });
    return {
      events: events.map((e) => ({
        id: e.id,
        flightOfferId: e.flightOfferId,
        type: e.type,
        previousPriceEurCents: e.previousPriceEurCents,
        newPriceEurCents: e.newPriceEurCents,
        dropAmountEurCents: e.dropAmountEurCents,
        dropPct: e.dropPct,
        confirmed: e.confirmed,
        detectedAt: e.detectedAt.toISOString(),
        resolvedAt: e.resolvedAt?.toISOString() ?? null,
        durationSeconds: e.durationSeconds,
      })),
    };
  });
};
