import { loadConfig } from "@fbr/config";
import { createDatabase } from "@fbr/database";
import {
  createQueueConnection,
  createSearchQueue,
  createSearchWorker,
  type SearchJob,
} from "@fbr/queue";
import { DEFAULT_DROP_THRESHOLDS } from "@fbr/analytics";
import { createLogger, LogEvent } from "@fbr/shared";
import { buildConfirmer } from "./confirmer.js";
import { buildFxService } from "./fx.js";
import { buildNotificationService } from "./notifications.js";
import { buildConfirmationOracle, buildProviderRegistry } from "./providers.js";
import { createScheduler } from "./scheduler.js";
import { processSearchRun, type SearchProcessorDeps } from "./search-processor.js";

const config = loadConfig();
const logger = createLogger({ name: "worker", level: config.log.level, pretty: config.log.pretty });

const db = createDatabase({ url: config.database.url });
const connection = createQueueConnection(config.redis.url);
const queue = createSearchQueue(connection);
const registry = buildProviderRegistry(config, logger);
const confirmationOracle = buildConfirmationOracle(config, logger);
const fx = buildFxService(config, db.db);
const notificationService = buildNotificationService(config, logger);

// Travelpayouts est du cache (~48 h) : sonder plus vite qu'un palier de 3 h ne
// sert à rien et grille le quota. On relève le plancher si c'est la seule
// source réelle (SerpApi / fast-flights la surclassent en fraîcheur).
const onlyCachedSource =
  config.providers.travelpayouts !== null &&
  config.providers.serpapi === null &&
  config.providers.fastFlights === null;
const providerMinIntervalSeconds = onlyCachedSource
  ? Math.max(config.engine.providerMinIntervalSeconds, 10_800)
  : config.engine.providerMinIntervalSeconds;
if (onlyCachedSource) {
  logger.info(
    { event: "cached_source_interval_floor", providerMinIntervalSeconds },
    "source en cache uniquement — plancher d'intervalle relevé",
  );
}

const processorDeps: SearchProcessorDeps = {
  db: db.db,
  registry,
  logger,
  combinationsPerRun: config.engine.combinationsPerRun,
  providerMinIntervalSeconds,
  radarBatchSize: config.engine.radarBatchSize,
  thresholds: {
    ...DEFAULT_DROP_THRESHOLDS,
    priceDropPct: config.detection.dropPct,
    flashDropPct: config.detection.flashDropPct,
    flashDropAbsCents: config.detection.flashDropAbsCents,
    flashWindowMinutes: config.detection.flashWindowMinutes,
    unusualMinSample: config.detection.analyticsMinSample,
  },
  toBaseCents: (cents, currency) => fx.toBaseCents(cents, currency),
  notificationService,
  confirm: buildConfirmer(registry, fx, {
    ...(confirmationOracle ? { oracle: confirmationOracle } : {}),
    logger,
  }),
};

const worker = createSearchWorker((job: SearchJob) => processSearchRun(processorDeps, job.data), {
  connection,
  concurrency: config.engine.searchWorkerConcurrency,
});
worker.on("failed", (job, err) => {
  logger.error({ event: "search_job_failed", jobId: job?.id, err }, "job de recherche en échec");
});

const scheduler = createScheduler({
  db: db.db,
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
  await db.close();
  process.exit(0);
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal));
}
