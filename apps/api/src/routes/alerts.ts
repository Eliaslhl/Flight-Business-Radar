import {
  createAlert,
  deleteAlert,
  getAlert,
  getSearch,
  listAlerts,
  setAlertEnabled,
  type AlertRow,
  type Database,
} from "@fbr/database";
import type { FastifyReply, FastifyRequest } from "fastify";
import { requireUser } from "../auth.js";
import { createAlertBodySchema } from "../schemas.js";
import { type ApiInstance } from "../types.js";

export interface AlertRoutesDeps {
  readonly db: Database;
}

const toDto = (row: AlertRow) => ({
  id: row.id,
  searchId: row.searchId,
  type: row.type,
  thresholdEurCents: row.thresholdEurCents,
  enabled: row.enabled,
  cooldownSeconds: row.cooldownSeconds,
  lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export const registerAlertRoutes = (app: ApiInstance, deps: AlertRoutesDeps): void => {
  const { db } = deps;

  const loadOwnedAlert = async (
    id: string,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AlertRow | null> => {
    const uid = requireUser(request, reply);
    if (!uid) return null;
    const row = await getAlert(db, id);
    if (row?.userId !== uid) {
      void reply.code(404).send({ error: "NOT_FOUND" });
      return null;
    }
    return row;
  };

  app.post("/api/alerts", async (request, reply) => {
    const uid = requireUser(request, reply);
    if (!uid) return reply;
    const parsed = createAlertBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "VALIDATION_FAILED",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const search = await getSearch(db, parsed.data.searchId);
    if (search?.userId !== uid) {
      return reply.code(404).send({ error: "SEARCH_NOT_FOUND" });
    }

    const created = await createAlert(db, {
      userId: uid,
      searchId: parsed.data.searchId,
      type: parsed.data.type,
      thresholdEurCents: parsed.data.thresholdEurCents ?? null,
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.cooldownSeconds !== undefined
        ? { cooldownSeconds: parsed.data.cooldownSeconds }
        : {}),
    });
    return reply.code(201).send(toDto(created));
  });

  app.get("/api/alerts", async (request, reply) => {
    const uid = requireUser(request, reply);
    if (!uid) return reply;
    const query = request.query as { searchId?: string };
    const rows = await listAlerts(db, {
      userId: uid,
      ...(query.searchId ? { searchId: query.searchId } : {}),
    });
    return { alerts: rows.map(toDto) };
  });

  app.post("/api/alerts/:id/enable", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await loadOwnedAlert(id, request, reply))) return reply;
    const row = await setAlertEnabled(db, id, true);
    return row ? toDto(row) : reply.code(404).send({ error: "NOT_FOUND" });
  });

  app.post("/api/alerts/:id/disable", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await loadOwnedAlert(id, request, reply))) return reply;
    const row = await setAlertEnabled(db, id, false);
    return row ? toDto(row) : reply.code(404).send({ error: "NOT_FOUND" });
  });

  app.delete("/api/alerts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await loadOwnedAlert(id, request, reply))) return reply;
    await deleteAlert(db, id);
    return reply.code(204).send();
  });
};
