/**
 * Statistiques descriptives sur une série de valeurs (prix en centimes EUR).
 * Toutes les fonctions sont pures ; elles renvoient `null` pour une série vide.
 */

export interface Summary {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly p10: number;
  readonly p25: number;
  readonly p75: number;
  readonly p90: number;
  readonly stdDev: number;
  /** Volatilité relative : écart-type / moyenne (0 si moyenne nulle). */
  readonly coefficientOfVariation: number;
}

const asc = (a: number, b: number): number => a - b;

/** Percentile par interpolation linéaire. `sorted` doit être trié croissant. `p` ∈ [0,1]. */
export const percentile = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0]!;
  const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
  const idx = clamped * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
};

export const mean = (values: readonly number[]): number =>
  values.length === 0 ? Number.NaN : values.reduce((s, v) => s + v, 0) / values.length;

export const median = (values: readonly number[]): number => percentile([...values].sort(asc), 0.5);

/** Écart-type de population (N, pas N-1). */
export const stdDev = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
};

export const summarize = (values: readonly number[]): Summary | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort(asc);
  const m = mean(sorted);
  const sd = stdDev(sorted);
  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean: m,
    median: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    stdDev: sd,
    coefficientOfVariation: m === 0 ? 0 : sd / m,
  };
};
