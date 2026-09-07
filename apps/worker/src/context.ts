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

  // Plancher d'intervalle de sondage, selon la source réelle :
  // - SerpApi actif (payant, 1 appel = 1 crédit, 3 cabines/passage) → 6 h, pour
  //   tenir le budget mensuel ; les combos sont aussi ramenés à 1 (voir plus bas).
  // - Travelpayouts seul (cache ~48 h) → 3 h, sonder plus vite ne sert à rien.
  const serpapiActive = config.providers.serpapi !== null;
  const onlyCachedSource =
    !serpapiActive &&
    config.providers.travelpayouts !== null &&
    config.providers.fastFlights === null;
  const providerMinIntervalSeconds = serpapiActive
    ? Math.max(config.engine.providerMinIntervalSeconds, 21_600)
    : onlyCachedSource
      ? Math.max(config.engine.providerMinIntervalSeconds, 10_800)
      : config.engine.providerMinIntervalSeconds;
  if (serpapiActive || onlyCachedSource) {
    logger.info(
      {
        event: serpapiActive ? "serpapi_budget_interval_floor" : "cached_source_interval_floor",
        providerMinIntervalSeconds,
      },
      "plancher d'intervalle de sondage relevé",
    );
  }

  const deps: SearchProcessorDeps = {
    db: handle.db,
    registry,
    logger,
    serpapiActive,
    serpapiCombosPerRun: config.engine.serpapiCombosPerRun,
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
