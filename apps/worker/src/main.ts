import { loadConfig } from "@fbr/config";
import {
  createQueueConnection,
  createSearchQueue,
  createSearchWorker,
  type SearchJob,
} from "@fbr/queue";
import { createLogger, LogEvent } from "@fbr/shared";
import { buildProcessorContext } from "./context.js";
import { createScheduler } from "./scheduler.js";
import { processSearchRun } from "./search-processor.js";

const config = loadConfig();
const logger = createLogger({ name: "worker", level: config.log.level, pretty: config.log.pretty });

if (!config.redis) {
  logger.fatal(
    { event: "redis_required" },
    "REDIS_URL est requis pour le worker long-running — utilisez `worker/once` (cron) pour un déploiement sans file",
  );
  process.exit(1);
}

const { deps: processorDeps, db, close: closeDb } = buildProcessorContext(config, logger);
const connection = createQueueConnection(config.redis.url);
const queue = createSearchQueue(connection);

const worker = createSearchWorker((job: SearchJob) => processSearchRun(processorDeps, job.data), {
  connection,
  concurrency: config.engine.searchWorkerConcurrency,
});
worker.on("failed", (job, err) => {
  logger.error({ event: "search_job_failed", jobId: job?.id, err }, "job de recherche en échec");
});

const scheduler = createScheduler({
  db,
  queue,
  logger,
  intervalMs: config.engine.schedulerIntervalMs,
});

scheduler.start();
logger.info({ event: LogEvent.AppStarted, env: config.env }, "worker prêt");

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: LogEvent.AppStopped, signal }, "arrêt du worker");
  await scheduler.stop();
  await worker.close();
  await queue.close();
  await connection.quit();
  await closeDb();
  process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal));
}
