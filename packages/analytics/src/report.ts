import { summarize, type Summary } from "./descriptive.js";
import {
  airlineStats,
  dayOfWeekStats,
  monthlyStats,
  stopsStats,
  tripDurationStats,
  type GroupOptions,
  type GroupStat,
  type PriceObservation,
} from "./grouped.js";
import { computePriceTrend, type Trend } from "./trend.js";

export interface PricePoint {
  readonly priceEurCents: number;
  readonly observedAt: string;
}

export interface BestMonth {
  readonly key: string;
  readonly meanEurCents: number;
  readonly reliable: boolean;
}

export interface AnalyticsReport {
  readonly currency: "EUR";
  readonly sampleSize: number;
  /** `false` si l'échantillon global est insuffisant pour être présenté comme fiable. */
  readonly reliable: boolean;
  readonly summary: Summary | null;
  readonly trend: Trend | null;
  /** Prix le plus bas jamais observé. */
  readonly best: PricePoint | null;
  /** Observation la plus récente. */
  readonly latest: PricePoint | null;
  readonly byMonth: GroupStat<string>[];
  readonly byDayOfWeek: GroupStat<number>[];
  readonly byTripDuration: GroupStat<number>[];
  readonly byAirline: GroupStat<string>[];
  readonly byStops: GroupStat<number>[];
  /** Mois de départ le moins cher (privilégie les groupes fiables). */
  readonly bestMonth: BestMonth | null;
}

export interface BuildReportOptions extends GroupOptions {
  /** Seuil de fiabilité global (nombre d'observations). Défaut 30. */
  readonly overallMinSampleSize?: number;
}

const pickBestMonth = (groups: GroupStat<string>[]): BestMonth | null => {
  if (groups.length === 0) return null;
  const reliable = groups.filter((g) => g.reliable);
  const pool = reliable.length > 0 ? reliable : groups;
  const best = pool.reduce((a, b) => (b.summary.mean < a.summary.mean ? b : a));
  return { key: best.key, meanEurCents: Math.round(best.summary.mean), reliable: best.reliable };
};

/**
 * Assemble un rapport d'analyse complet à partir des observations de prix d'une
 * recherche. Toutes les valeurs sont en centimes EUR (devise unique — Phase 0 §28).
 */
export const buildAnalyticsReport = (
  observations: readonly PriceObservation[],
  options: BuildReportOptions = {},
): AnalyticsReport => {
  const sorted = [...observations].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const prices = sorted.map((o) => o.priceEurCents);
  const overallMin = options.overallMinSampleSize ?? 30;

  const best = sorted.reduce<PricePoint | null>(
    (acc, o) =>
      acc === null || o.priceEurCents < acc.priceEurCents
        ? { priceEurCents: o.priceEurCents, observedAt: o.observedAt }
        : acc,
    null,
  );
  const last = sorted.at(-1);
  const byMonth = monthlyStats(sorted, options);

  return {
    currency: "EUR",
    sampleSize: prices.length,
    reliable: prices.length >= overallMin,
    summary: summarize(prices),
    trend: computePriceTrend(sorted.map((o) => ({ at: o.observedAt, value: o.priceEurCents }))),
    best,
    latest: last ? { priceEurCents: last.priceEurCents, observedAt: last.observedAt } : null,
    byMonth,
    byDayOfWeek: dayOfWeekStats(sorted, options),
    byTripDuration: tripDurationStats(sorted, options),
    byAirline: airlineStats(sorted, options),
    byStops: stopsStats(sorted, options),
    bestMonth: pickBestMonth(byMonth),
  };
};
