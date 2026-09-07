import { type AppConfig } from "@fbr/config";
import { AppError, LogEvent, type Logger } from "@fbr/shared";
import { pingDatabase, type DbHandle } from "@fbr/database";
import { type Queue, type SearchRunJobData } from "@fbr/queue";
import Fastify, { type FastifyError } from "fastify";
import fastifyCookie from "@fastify/cookie";
import { resolveUser } from "./auth.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import { registerRadarRoutes } from "./routes/radar.js";
import { registerSearchRoutes } from "./routes/searches.js";
import { type ApiInstance } from "./types.js";

export { type ApiInstance } from "./types.js";

export interface BuildAppOptions {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** Handle DB — requis pour exposer les routes `/api/*`. Sans lui, seul `/health` est servi. */
  readonly db?: DbHandle;
  /** File `search` — requise pour `POST /api/searches/:id/run`. */
  readonly queue?: Queue<SearchRunJobData>;
}

interface HealthReport {
  status: "ok" | "degraded";
  service: "api";
  version: string;
  uptimeSeconds: number;
  checks: {
    database: "ok" | "error" | "skipped";
  };
}

/**
 * Construit l'instance Fastify. Les controllers restent fins (Phase 0 §21) :
 * ils délèguent aux repositories `@fbr/database` et au moteur `@fbr/search-engine`.
 */
export const buildApp = (options: BuildAppOptions): ApiInstance => {
  const { config, logger, db, queue } = options;

  const app = Fastify({
    loggerInstance: logger,
    ajv: { customOptions: { removeAdditional: "all", coerceTypes: true } },
  });

  void app.register(fastifyCookie);
  // Renseigne `request.userId` (session, ou utilisateur de dev si auth désactivée).
  const attachUser = resolveUser(config.auth);
  app.addHook("preHandler", (request, _reply, done) => {
    attachUser(request);
    done();
  });

  app.get("/health", async (_request, reply) => {
    let database: HealthReport["checks"]["database"] = "skipped";
    if (db) {
      try {
        database = (await pingDatabase(db)) ? "ok" : "error";
      } catch {
        database = "error";
      }
    }

    const report: HealthReport = {
      status: database === "error" ? "degraded" : "ok",
      service: "api",
      version: process.env.npm_package_version ?? "0.0.0",
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database },
    };
    return reply.code(report.status === "ok" ? 200 : 503).send(report);
  });

  if (db) {
    registerAuthRoutes(app, { db: db.db, auth: config.auth, logger });
    registerSearchRoutes(app, {
      db: db.db,
      ...(queue ? { queue } : {}),
      logger,
      analyticsMinSample: config.detection.analyticsMinSample,
      advisor: { anthropic: config.advisor.anthropic },
    });
    registerAlertRoutes(app, { db: db.db });
  }

  // Config-only / statique (aucun secret, aucune dépendance DB) — toujours disponible.
  registerNotificationRoutes(app, { config });
  registerRadarRoutes(app);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      logger.warn({ err: error.toLogObject(), url: request.url }, "erreur applicative");
      return reply.code(400).send({ error: error.code, message: error.message });
    }
    logger.error({ err: error, url: request.url }, "erreur non gérée");
    return reply.code(error.statusCode ?? 500).send({ error: "INTERNAL" });
  });

  app.addHook("onReady", async () => {
    logger.info(
      { event: LogEvent.AppStarted, env: config.env, routes: db ? "full" : "health-only" },
      "api ready",
    );
    await Promise.resolve();
  });

  return app;
};
