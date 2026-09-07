import { loadConfig } from "@fbr/config";
import { createDatabase, listDueSearches, pruneOldSnapshots, runMigrations } from "@fbr/database";
import { createLogger, LogEvent } from "@fbr/shared";
import { buildProcessorContext } from "./context.js";
import { processSearchRun } from "./search-processor.js";

/**
 * Runner **one-shot** : traite en un passage toutes les recherches actives dont
 * l'échéance est atteinte, puis purge les vieux snapshots, puis rend la main.
 * Aucune file Redis, aucun process long — pensé pour un cron GitHub Actions
 * (`.github/workflows/poll.yml`) sur un déploiement gratuit.
 *
 * `worker/once --migrate` applique d'abord les migrations en attente (le job de
 * cron n'a pas d'autre fenêtre pour le faire).
 */
const main = async (): Promise<void> => {
  const config = loadConfig();
  const logger = createLogger({
    name: "worker:once",
    level: config.log.level,
    pretty: config.log.pretty,
  });
  const startedAt = new Date();

  if (process.argv.includes("--migrate")) {
    const handle = createDatabase({ url: config.database.url, maxConnections: 1 });
    try {
      await runMigrations(handle);
      logger.info({ event: "once_migrations_applied" }, "migrations appliquées");
    } finally {
      await handle.close();
    }
  }

  const { db, deps, close } = buildProcessorContext(config, logger);
  let processed = 0;
  let failed = 0;
  const totals = { snapshotsInserted: 0, eventsDetected: 0, alertsTriggered: 0 };

  try {
    const due = await listDueSearches(db, startedAt, config.engine.onceMaxSearches);
    logger.info(
      { event: LogEvent.AppStarted, mode: "once", due: due.length, env: config.env },
      "run one-shot démarré",
    );

    for (const search of due) {
      try {
        const summary = await processSearchRun(deps, { searchId: search.id, reason: "scheduled" });
        totals.snapshotsInserted += summary.snapshotsInserted;
        totals.eventsDetected += summary.eventsDetected;
        totals.alertsTriggered += summary.alertsTriggered;
        processed += 1;
      } catch (err) {
        failed += 1;
        logger.error(
          { err, event: "once_search_failed", searchId: search.id },
          "échec du traitement d'une recherche",
        );
      }
    }

    const pruned = await pruneOldSnapshots(db, config.engine.snapshotRetentionDays, startedAt);
    logger.info(
      {
        event: LogEvent.AppStopped,
        mode: "once",
        processed,
        failed,
        pruned,
        durationMs: Date.now() - startedAt.getTime(),
        ...totals,
      },
      "run one-shot terminé",
    );
  } finally {
    await close();
  }

  // Échec dur : aucune recherche traitée alors qu'il y en avait — signale au cron.
  if (failed > 0 && processed === 0) process.exitCode = 1;
};

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- dernier recours avant sortie non nulle
  console.error(err);
  process.exit(1);
});
