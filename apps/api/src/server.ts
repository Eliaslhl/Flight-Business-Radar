import { loadConfig } from "@fbr/config";
import { createDatabase } from "@fbr/database";
import { createLogger, LogEvent } from "@fbr/shared";
import { buildApp } from "./app.js";

const config = loadConfig();
const logger = createLogger({
  name: "api",
  level: config.log.level,
  pretty: config.log.pretty,
});

const db = createDatabase({ url: config.database.url });
const app = buildApp({ config, logger, db });

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ event: LogEvent.AppStopped, signal }, "arrêt de l'api");
  await app.close();
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
