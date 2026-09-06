import { type AppConfig } from "@fbr/config";
import { getFxRate, upsertFxRate, type Database } from "@fbr/database";
import {
  FixedFxProvider,
  FrankfurterFxProvider,
  FxService,
  type FxProvider,
  type RateStore,
} from "@fbr/fx";

const dbRateStore = (db: Database): RateStore => ({
  get: (base, quote, asOf) => getFxRate(db, base, quote, asOf),
  put: (r) =>
    upsertFxRate(db, {
      base: r.base,
      quote: r.quote,
      rate: r.rate,
      asOf: r.asOf,
      source: r.source,
    }),
});

/**
 * `FxService` du worker : provider piloté par `FX_SOURCE`, cache persistant dans
 * la table `fx_rates`. La devise de référence des statistiques est `BASE_CURRENCY`.
 */
export const buildFxService = (config: AppConfig, db: Database): FxService => {
  const base = config.currency.base;
  const provider: FxProvider =
    config.currency.fxSource === "fixed"
      ? new FixedFxProvider(base, config.currency.fixedRates)
      : new FrankfurterFxProvider();
  return new FxService({ provider, store: dbRateStore(db), base });
};
