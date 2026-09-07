import { loadConfig } from "@fbr/config";
import { createDatabase } from "@fbr/database";
import { createQueueConnection, createSearchQueue } from "@fbr/queue";
import { createLogger, LogEvent } from "@fbr/shared";
import { buildApp } from "./app.js";

const config = loadConfig();
const logger = createLogger({
  name: "api",
  level: config.log.level,
  pretty: config.log.pretty,
});

const db = createDatabase({ url: config.database.url });
// File Redis optionnelle : sans `REDIS_URL`, l'API sert en lecture seule et
// `POST /api/searches/:id/run` répond 503 (l'enqueue manuel est indisponible).
const connection = config.redis ? createQueueConnection(config.redis.url) : null;
const queue = connection ? createSearchQueue(connection) : undefined;
if (!queue) {
  logger.warn({ event: "queue_disabled" }, "REDIS_URL absent — enqueue manuel désactivé");
}
const app = buildApp({ config, logger, db, ...(queue ? { queue } : {}) });

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ event: LogEvent.AppStopped, signal }, "arrêt de l'api");
  await app.close();
  if (queue) await queue.close();
  if (connection) await connection.quit();
  await db.close();
  process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

app
  .listen({ host: config.api.host, port: config.api.port })
  .then((address) => logger.info({ address }, "api à l'écoute"))
  .catch((error: unknown) => {
    logger.error({ err: error }, "échec du démarrage de l'api");
    process.exit(1);
  });
