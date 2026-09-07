import { type AppConfig } from "@fbr/config";
import { DEFAULT_DROP_THRESHOLDS } from "@fbr/analytics";
import { createDatabase, type Database } from "@fbr/database";
import { type Logger } from "@fbr/shared";
import { buildConfirmer } from "./confirmer.js";
import { buildFxService } from "./fx.js";
import { buildNotificationService } from "./notifications.js";
import { buildConfirmationOracle, buildProviderRegistry } from "./providers.js";
import { type SearchProcessorDeps } from "./search-processor.js";

export interface ProcessorContext {
  readonly db: Database;
  readonly deps: SearchProcessorDeps;
  /** Ferme le pool Postgres. Ne touche pas à Redis (géré par l'appelant). */
  readonly close: () => Promise<void>;
}

/**
 * Assemble les dépendances du traitement d'une recherche (providers, FX,
 * détection, notifications, confirmer). Partagé par le worker long-running
 * (`main.ts`) et le runner one-shot (`once.ts`, cron GitHub Actions) — aucune
 * dépendance à la file Redis ici.
 */
export const buildProcessorContext = (config: AppConfig, logger: Logger): ProcessorContext => {
  const handle = createDatabase({ url: config.database.url });
  const registry = buildProviderRegistry(config, logger);
  const confirmationOracle = buildConfirmationOracle(config, logger);
  const fx = buildFxService(config, handle.db);
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

  const deps: SearchProcessorDeps = {
    db: handle.db,
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

  return { db: handle.db, deps, close: () => handle.close() };
};
