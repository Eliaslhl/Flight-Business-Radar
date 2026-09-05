import { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type AppConfig } from "@fbr/config";
import { LogEvent, type Logger } from "@fbr/shared";
import { pingDatabase, type DbHandle } from "@fbr/database";
import Fastify, { type FastifyInstance } from "fastify";

/** Instance Fastify paramétrée avec le logger pino de `@fbr/shared`. */
export type ApiInstance = FastifyInstance<Server, IncomingMessage, ServerResponse, Logger>;

export interface BuildAppOptions {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** Handle DB optionnel — si absent, le healthcheck reporte `database: "skipped"`. */
  readonly db?: DbHandle;
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
 * Construit l'instance Fastify. Aucune logique métier ici (Phase 0 §21) —
 * seulement le socle HTTP + le healthcheck. Les routes `/api/*` arrivent en Phase 3.
 */
export const buildApp = (options: BuildAppOptions): ApiInstance => {
  const { config, logger, db } = options;

  const app = Fastify({
    loggerInstance: logger,
    ajv: { customOptions: { removeAdditional: "all", coerceTypes: true } },
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

  app.addHook("onReady", async () => {
    logger.info({ event: LogEvent.AppStarted, env: config.env }, "api ready");
    await Promise.resolve();
  });

  return app;
};
