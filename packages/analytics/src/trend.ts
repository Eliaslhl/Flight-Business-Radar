export interface TrendPoint {
  /** Instant de l'observation (ISO 8601 ou epoch ms). */
  readonly at: string | number;
  readonly value: number;
}

export type TrendDirection = "RISING" | "FALLING" | "STABLE";

export interface Trend {
  /** Pente de la régression linéaire, en valeur par jour. */
  readonly slopePerDay: number;
  readonly direction: TrendDirection;
  /** Variation relative entre la première et la dernière observation. */
  readonly changePct: number;
  readonly points: number;
  /** Coefficient de détermination R² (qualité de l'ajustement). */
  readonly r2: number;
}

export interface TrendOptions {
  /**
   * Seuil (en fraction de la valeur moyenne, par jour) en-dessous duquel la
   * tendance est considérée `STABLE`. Défaut 0.2 % / jour.
   */
  readonly stableSlopeRatioPerDay?: number;
}

const toMs = (at: string | number): number => (typeof at === "number" ? at : Date.parse(at));

/**
 * Tendance des prix par régression linéaire des moindres carrés sur (jours, prix).
 * `null` si moins de 2 points ou si les instants sont invalides/identiques.
 */
export const computePriceTrend = (
  points: readonly TrendPoint[],
  options: TrendOptions = {},
): Trend | null => {
  if (points.length < 2) return null;

  const rows = points
    .map((p) => ({ t: toMs(p.at), v: p.value }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
  if (rows.length < 2) return null;

  const t0 = rows[0]!.t;
  const xs = rows.map((r) => (r.t - t0) / 86_400_000); // jours depuis la 1re observation
  const ys = rows.map((r) => r.v);
  const spanDays = (xs.at(-1) ?? 0) - (xs.at(0) ?? 0);
  if (spanDays === 0) return null;

  const n = rows.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slopePerDay = sxx === 0 ? 0 : sxy / sxx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);

  const first = ys[0]!;
  const last = ys[ys.length - 1]!;
  const changePct = first === 0 ? 0 : (last - first) / first;

  const stableRatio = options.stableSlopeRatioPerDay ?? 0.002;
  const threshold = Math.abs(meanY) * stableRatio;
  const direction: TrendDirection =
    Math.abs(slopePerDay) <= threshold ? "STABLE" : slopePerDay > 0 ? "RISING" : "FALLING";

  return { slopePerDay, direction, changePct, points: n, r2 };
};
