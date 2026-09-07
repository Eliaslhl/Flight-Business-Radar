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
  setSearchPriority,
  setSearchStatus,
  updateSearch,
  updateSearchSchedule,
  type Database,
  type SearchRow,
  type UpdateSearchInput,
} from "@fbr/database";
import {
  buildAnalyticsReport,
  buildRecommendationReport,
  type AnalyticsReport,
  type PriceObservation,
  type RecommendationObservation,
  type RecommendationReport,
} from "@fbr/analytics";
import {
  AnthropicLlmClient,
  MockLlmClient,
  buildAdvisorInput,
  generateAdvice,
  type LlmClient,
} from "@fbr/advisor";
import { enqueueSearchRun, type Queue, type SearchRunJobData } from "@fbr/queue";
import { generateDateCombinations } from "@fbr/search-engine";
import { type Logger } from "@fbr/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { requireUser } from "../auth.js";
import { createSearchBodySchema, updateSearchBodySchema } from "../schemas.js";
import { type ApiInstance } from "../types.js";

export interface SearchRoutesDeps {
  readonly db: Database;
  readonly queue?: Queue<SearchRunJobData>;
  readonly logger: Logger;
  readonly analyticsMinSample: number;
  /** Config Anthropic — si absente, l'advisor utilise le générateur `rules`. */
  readonly advisor?: {
    readonly anthropic: {
      readonly apiKey: string;
      readonly model: string;
      readonly maxTokens: number;
      readonly timeoutMs: number;
    } | null;
  };
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
  priorityLocked: row.priorityLocked,
  intervalSeconds: row.intervalSeconds,
  nextRunAt: row.nextRunAt.toISOString(),
  lastRunAt: row.lastRunAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export const registerSearchRoutes = (app: ApiInstance, deps: SearchRoutesDeps): void => {
  const { db } = deps;

  /** Charge une recherche appartenant à l'utilisateur courant, sinon 404 (déjà envoyé). */
  const loadOwned = async (
    id: string,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<SearchRow | null> => {
    const uid = requireUser(request, reply);
    if (!uid) return null;
    const row = await getSearch(db, id);
    if (row?.userId !== uid) {
      void reply.code(404).send({ error: "NOT_FOUND" });
      return null;
    }
    return row;
  };

  app.post("/api/searches", async (request, reply) => {
    const uid = requireUser(request, reply);
    if (!uid) return reply;
    const parsed = createSearchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "VALIDATION_FAILED",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const body = parsed.data;
    const created = await createSearch(db, {
      userId: uid,
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

  app.get("/api/searches", async (request, reply) => {
    const uid = requireUser(request, reply);
    if (!uid) return reply;
    const rows = await listSearches(db, { userId: uid });
    return { searches: rows.map(toDto) };
  });

  app.get("/api/searches/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await loadOwned(id, request, reply);
    if (!row) return reply;
    return toDto(row);
  });

  app.delete("/api/searches/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await loadOwned(id, request, reply))) return reply;
    await deleteSearch(db, id);
    return reply.code(204).send();
  });

  app.post("/api/searches/:id/activate", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await loadOwned(id, request, reply))) return reply;
    const row = await setSearchStatus(db, id, "ACTIVE");
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    await updateSearchSchedule(db, id, { nextRunAt: new Date() });
    const fresh = await getSearch(db, id);
    return toDto(fresh ?? row);
  });

  app.post("/api/searches/:id/pause", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await loadOwned(id, request, reply))) return reply;
    const row = await setSearchStatus(db, id, "PAUSED");
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    return toDto(row);
  });

  app.post("/api/searches/:id/run", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await loadOwned(id, request, reply))) return reply;
    if (deps.queue) {
      const job = await enqueueSearchRun(deps.queue, { searchId: id, reason: "manual" });
      return reply.code(202).send({ enqueued: true, jobId: job.id });
    }
    // Pas de worker (déploiement gratuit) : on avance juste l'échéance, le
    // prochain passage du cron traitera la recherche.
    await updateSearchSchedule(db, id, { nextRunAt: new Date() });
    return reply.code(202).send({ enqueued: false, scheduled: true });
  });

  app.post("/api/searches/:id/priority", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await loadOwned(id, request, reply))) return reply;
    const body = request.body as { priority?: unknown };
    if (body.priority !== "HIGH" && body.priority !== "MEDIUM" && body.priority !== "LOW") {
      return reply.code(400).send({ error: "VALIDATION_FAILED", message: "priority invalide" });
    }
    const row = await setSearchPriority(db, id, body.priority);
    if (!row) return reply.code(404).send({ error: "NOT_FOUND" });
    return toDto(row);
  });

  app.patch("/api/searches/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = await loadOwned(id, request, reply);
    if (!current) return reply;
    const parsed = updateSearchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "VALIDATION_FAILED",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const b = parsed.data;
    // Un changement de dates / durée / route ⇒ regénérer les combinaisons + relancer.
    const combosChanged =
      b.departureWindow !== undefined ||
      b.tripDuration !== undefined ||
      b.origin !== undefined ||
      b.destinations !== undefined;

    const patch: UpdateSearchInput = {
      ...(b.label !== undefined ? { label: b.label } : {}),
      ...(b.origin !== undefined ? { origin: b.origin } : {}),
      ...(b.destinations !== undefined ? { destinations: b.destinations } : {}),
      ...(b.departureWindow !== undefined
        ? {
            departureWindowStart: b.departureWindow.start,
            departureWindowEnd: b.departureWindow.end,
          }
        : {}),
      ...(b.tripDuration !== undefined
        ? { minTripDays: b.tripDuration.minDays, maxTripDays: b.tripDuration.maxDays }
        : {}),
      ...(b.maxStops !== undefined ? { maxStops: b.maxStops } : {}),
      ...(b.maxPriceCents !== undefined ? { maxPriceCents: b.maxPriceCents } : {}),
      ...(b.targetPriceCents !== undefined ? { targetPriceCents: b.targetPriceCents } : {}),
      ...(combosChanged ? { nextRunAt: new Date() } : {}),
    };
    const updated = await updateSearch(db, id, patch);
    if (!updated) return reply.code(404).send({ error: "NOT_FOUND" });

    if (combosChanged) {
      const combos = generateDateCombinations({
        departureWindowStart: updated.departureWindowStart,
        departureWindowEnd: updated.departureWindowEnd,
        minTripDays: updated.minTripDays,
        maxTripDays: updated.maxTripDays,
      });
      await replaceCombinations(
        db,
        id,
        combos.map((c) => ({
          outboundDate: c.outboundDate,
          returnDate: c.returnDate,
          tripDays: c.tripDays,
          priorityScore: c.priorityScore,
        })),
      );
    }
    return toDto(updated);
  });

  app.get("/api/searches/:id/flights", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await loadOwned(id, request, reply);
    if (!row) return reply;
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
        bookingUrl: (f.offer.payload as { bookingUrl?: string }).bookingUrl ?? null,
        observedAt: f.observedAt.toISOString(),
        offer: f.offer.payload,
      })),
    };
  });

  app.get("/api/searches/:id/prices", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await loadOwned(id, request, reply);
    if (!row) return reply;
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
    const row = await loadOwned(id, request, reply);
    if (!row) return reply;
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

  const buildReports = async (
    row: SearchRow,
  ): Promise<{ analytics: AnalyticsReport; recommendation: RecommendationReport }> => {
    const rows = await listObservationsForAnalytics(db, row.id);
    const analyticsObs: PriceObservation[] = rows.map((o) => ({
      priceEurCents: o.priceEurCents,
      observedAt: o.observedAt.toISOString(),
      outboundDate: o.outboundDate,
      returnDate: o.returnDate,
      tripDays: o.tripDays,
      marketingAirline: o.marketingAirline,
      maxStops: o.maxStops,
    }));
    const recObs: RecommendationObservation[] = rows.map((o) => ({
      priceEurCents: o.priceEurCents,
      observedAt: o.observedAt.toISOString(),
      outboundDate: o.outboundDate,
      returnDate: o.returnDate,
      tripDays: o.tripDays,
      destination: o.destination,
    }));
    return {
      analytics: buildAnalyticsReport(analyticsObs, {
        minSampleSize: deps.analyticsMinSample,
        overallMinSampleSize: deps.analyticsMinSample,
      }),
      recommendation: buildRecommendationReport(recObs, {
        departureWindowStart: row.departureWindowStart,
        targetEurCents: row.targetPriceCents,
        maxEurCents: row.maxPriceCents,
        minSampleSize: deps.analyticsMinSample,
        radar: row.destinations.length === 0,
      }),
    };
  };

  app.get("/api/searches/:id/recommendations", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await loadOwned(id, request, reply);
    if (!row) return reply;
    return (await buildReports(row)).recommendation;
  });

  app.get("/api/searches/:id/advice", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await loadOwned(id, request, reply);
    if (!row) return reply;

    const { analytics, recommendation } = await buildReports(row);
    const facts = buildAdvisorInput({ search: row, analytics, recommendation });

    const anthropic = deps.advisor?.anthropic ?? null;
    const llm: LlmClient = anthropic ? new AnthropicLlmClient(anthropic) : new MockLlmClient();

    const advice = await generateAdvice(facts, { llm, logger: deps.logger });
    return { ...advice, facts, generatedAt: new Date().toISOString() };
  });

  app.get("/api/searches/:id/notifications", async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await loadOwned(id, request, reply);
    if (!row) return reply;
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
    const row = await loadOwned(id, request, reply);
    if (!row) return reply;
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
    const row = await loadOwned(id, request, reply);
    if (!row) return reply;
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
