import { summarize, type Summary } from "./descriptive.js";

/** Observation de prix normalisée (une ligne = un `price_snapshot` enrichi de l'offre). */
export interface PriceObservation {
  readonly priceEurCents: number;
  readonly observedAt: string;
  readonly outboundDate: string; // YYYY-MM-DD
  readonly returnDate: string | null;
  readonly tripDays: number | null;
  readonly marketingAirline: string | null;
  readonly maxStops: number;
}

export interface GroupStat<K> {
  readonly key: K;
  readonly summary: Summary;
  /** `false` si l'échantillon est trop petit pour être présenté comme fiable (Phase 0 §12). */
  readonly reliable: boolean;
}

export interface GroupOptions {
  /** Taille d'échantillon minimale pour marquer un groupe `reliable`. Défaut 20. */
  readonly minSampleSize?: number;
}

const DEFAULT_MIN_SAMPLE = 20;

const groupBy = <K>(
  obs: readonly PriceObservation[],
  keyOf: (o: PriceObservation) => K | null,
  minSampleSize: number,
  sortKeys: (a: K, b: K) => number,
): GroupStat<K>[] => {
  const buckets = new Map<string, { key: K; values: number[] }>();
  for (const o of obs) {
    const key = keyOf(o);
    if (key === null) continue;
    const id = String(key);
    const bucket = buckets.get(id) ?? { key, values: [] };
    bucket.values.push(o.priceEurCents);
    buckets.set(id, bucket);
  }
  return [...buckets.values()]
    .map(({ key, values }) => {
      const summary = summarize(values);
      return summary ? { key, summary, reliable: values.length >= minSampleSize } : null;
    })
    .filter((g): g is GroupStat<K> => g !== null)
    .sort((a, b) => sortKeys(a.key, b.key));
};

const numAsc = (a: number, b: number): number => a - b;
const strAsc = (a: string, b: string): number => a.localeCompare(b);

/** Statistiques par mois de départ (`YYYY-MM`). */
export const monthlyStats = (
  obs: readonly PriceObservation[],
  options: GroupOptions = {},
): GroupStat<string>[] =>
  groupBy(
    obs,
    (o) => o.outboundDate.slice(0, 7),
    options.minSampleSize ?? DEFAULT_MIN_SAMPLE,
    strAsc,
  );

/** Statistiques par jour de la semaine de départ (0 = dimanche … 6 = samedi). */
export const dayOfWeekStats = (
  obs: readonly PriceObservation[],
  options: GroupOptions = {},
): GroupStat<number>[] =>
  groupBy(
    obs,
    (o) => new Date(`${o.outboundDate}T00:00:00Z`).getUTCDay(),
    options.minSampleSize ?? DEFAULT_MIN_SAMPLE,
    numAsc,
  );

/** Statistiques par durée de séjour (jours). */
export const tripDurationStats = (
  obs: readonly PriceObservation[],
  options: GroupOptions = {},
): GroupStat<number>[] =>
  groupBy(obs, (o) => o.tripDays, options.minSampleSize ?? DEFAULT_MIN_SAMPLE, numAsc);

/** Statistiques par compagnie (marketing). */
export const airlineStats = (
  obs: readonly PriceObservation[],
  options: GroupOptions = {},
): GroupStat<string>[] =>
  groupBy(obs, (o) => o.marketingAirline, options.minSampleSize ?? DEFAULT_MIN_SAMPLE, strAsc);

/** Statistiques par nombre d'escales (le plus élevé des deux trajets). */
export const stopsStats = (
  obs: readonly PriceObservation[],
  options: GroupOptions = {},
): GroupStat<number>[] =>
  groupBy(obs, (o) => o.maxStops, options.minSampleSize ?? DEFAULT_MIN_SAMPLE, numAsc);
