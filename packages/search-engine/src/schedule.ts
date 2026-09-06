export type MonitoringTier = "COLD" | "NORMAL" | "WARM" | "HOT" | "VERIFY";

export interface TierIntervalsSeconds {
  readonly cold: number;
  readonly normal: number;
  readonly warm: number;
  readonly hot: number;
  readonly verify: number;
}

/** Valeurs par défaut (Phase 0 §8) — toutes surchargées via la config, jamais codées en dur ailleurs. */
export const DEFAULT_TIER_INTERVALS: TierIntervalsSeconds = {
  cold: 3600,
  normal: 1800,
  warm: 600,
  hot: 120,
  verify: 30,
};

export interface ScheduleContext {
  readonly hasOffers: boolean;
  readonly bestPriceCents?: number;
  readonly targetPriceCents?: number;
  readonly maxPriceCents?: number;
  /** Percentile 10 historique du prix (fourni à partir de la Phase 4). */
  readonly p10Cents?: number;
  readonly minEverCents?: number;
  /** Baisse relative récente (0.1 = -10 %). */
  readonly recentDropPct?: number;
  /** Une baisse vient d'être détectée → vérification immédiate. */
  readonly justDetectedDrop?: boolean;
  readonly daysUntilDeparture?: number;
}

const TIER_ORDER: MonitoringTier[] = ["COLD", "NORMAL", "WARM", "HOT"];

/** Détermine le palier de surveillance à partir du contexte prix. */
export const computeMonitoringTier = (ctx: ScheduleContext): MonitoringTier => {
  if (ctx.justDetectedDrop) return "VERIFY";

  const best = ctx.bestPriceCents;
  const target = ctx.targetPriceCents;
  const drop = ctx.recentDropPct ?? 0;

  let tier: MonitoringTier = "COLD";

  if (ctx.hasOffers && best !== undefined) {
    const belowTarget = target !== undefined && best <= target;
    const belowP10 = ctx.p10Cents !== undefined && best <= ctx.p10Cents;
    if (belowTarget || belowP10 || drop >= 0.1) {
      tier = "HOT";
    } else if ((target !== undefined && best <= target * 1.15) || drop >= 0.03) {
      tier = "WARM";
    } else if (ctx.maxPriceCents !== undefined && best <= ctx.maxPriceCents) {
      tier = "NORMAL";
    }
  }

  // Départ proche → resserrer d'un cran (max HOT).
  if (
    ctx.daysUntilDeparture !== undefined &&
    ctx.daysUntilDeparture <= 10 &&
    ctx.daysUntilDeparture >= 0 &&
    tier !== "HOT"
  ) {
    const idx = TIER_ORDER.indexOf(tier);
    tier = TIER_ORDER[Math.min(idx + 1, TIER_ORDER.length - 1)] ?? tier;
  }

  return tier;
};

export interface NextIntervalOptions {
  readonly intervals?: Partial<TierIntervalsSeconds>;
  /** Plancher imposé par le rate limit du provider. */
  readonly providerMinIntervalSeconds?: number;
  /** Amplitude du jitter relatif (défaut 0.1 = ±10 %). */
  readonly jitterRatio?: number;
  readonly rng?: () => number;
}

export interface NextIntervalResult {
  readonly tier: MonitoringTier;
  readonly intervalSeconds: number;
}

const tierKey: Record<MonitoringTier, keyof TierIntervalsSeconds> = {
  COLD: "cold",
  NORMAL: "normal",
  WARM: "warm",
  HOT: "hot",
  VERIFY: "verify",
};

/**
 * Intervalle avant la prochaine exécution : palier → intervalle de base,
 * plancher provider, puis jitter ±`jitterRatio` (anti thundering herd).
 */
export const computeNextIntervalSeconds = (
  ctx: ScheduleContext,
  options: NextIntervalOptions = {},
): NextIntervalResult => {
  const tier = computeMonitoringTier(ctx);
  const intervals = { ...DEFAULT_TIER_INTERVALS, ...options.intervals };
  const base = intervals[tierKey[tier]];

  const floor = options.providerMinIntervalSeconds ?? 0;
  const jitterRatio = options.jitterRatio ?? 0.1;
  const rng = options.rng ?? Math.random;
  const jitter = 1 + (rng() * 2 - 1) * jitterRatio;

  const intervalSeconds = Math.max(floor, Math.round(base * jitter));
  return { tier, intervalSeconds };
};
