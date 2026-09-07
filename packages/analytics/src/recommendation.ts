import { summarize, type Summary } from "./descriptive.js";
import { computePriceTrend, type TrendDirection } from "./trend.js";

/** Observation enrichie de la destination (obligatoire ici : le mode Radar en dépend). */
export interface RecommendationObservation {
  readonly priceEurCents: number;
  readonly observedAt: string; // ISO 8601
  readonly outboundDate: string; // YYYY-MM-DD
  readonly returnDate: string | null;
  readonly tripDays: number | null;
  readonly destination: string; // IATA
}

export type OpportunityBand = "EXCEPTIONAL" | "GOOD" | "FAIR" | "POOR" | "INSUFFICIENT_DATA";

export interface OpportunityFactors {
  /** 0-60 — position du prix courant dans la distribution historique. */
  readonly pricePts: number;
  /** 0-15 — direction de la tendance. */
  readonly trendPts: number;
  /** 0-15 — proximité du départ. */
  readonly urgencyPts: number;
  /** 0-10 — prix courant vs cible / plafond. */
  readonly targetPts: number;
  /** Écart du prix courant à la médiane historique, en %. */
  readonly priceVsMedianPct: number;
}

export interface OpportunityScore {
  /** 0-100, ou `null` si les données sont insuffisantes. */
  readonly score: number | null;
  readonly band: OpportunityBand;
  readonly reasons: string[];
  readonly factors: OpportunityFactors | null;
}

export interface OpportunityInput {
  readonly currentPriceEurCents: number;
  readonly summary: Summary | null;
  readonly trendDirection: TrendDirection | null;
  readonly daysUntilDeparture: number | null;
  readonly targetEurCents?: number | null;
  readonly maxEurCents?: number | null;
  readonly sampleSize: number;
  /** Échantillon minimal pour produire un score (défaut 20). */
  readonly minSampleSize?: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const round = (v: number): number => Math.round(v);

const bandOf = (score: number): Exclude<OpportunityBand, "INSUFFICIENT_DATA"> =>
  score >= 80 ? "EXCEPTIONAL" : score >= 60 ? "GOOD" : score >= 40 ? "FAIR" : "POOR";

/**
 * Score d'opportunité 0-100 : « à quel point le prix courant est une bonne
 * affaire, maintenant ». Combine position dans l'historique (60), tendance (15),
 * urgence avant départ (15) et proximité de la cible (10). Explicable via
 * `reasons` + `factors`. `null` tant que l'échantillon est trop petit (Phase 0 §12).
 */
export const computeOpportunityScore = (input: OpportunityInput): OpportunityScore => {
  const minSample = input.minSampleSize ?? 20;
  const s = input.summary;
  if (s === null || input.sampleSize < minSample) {
    return {
      score: null,
      band: "INSUFFICIENT_DATA",
      reasons: [
        `Historique insuffisant (${String(input.sampleSize)} obs, minimum ${String(minSample)})`,
      ],
      factors: null,
    };
  }

  const price = input.currentPriceEurCents;
  const reasons: string[] = [];

  // ── Position dans la distribution (0-60) ────────────────────────────────
  let pricePts: number;
  if (price <= s.p10) {
    pricePts = 60;
    reasons.push("Prix sous le 10ᵉ percentile historique");
  } else if (price <= s.p25) {
    pricePts = 46;
    reasons.push("Prix dans le quart le moins cher");
  } else if (price <= s.median) {
    pricePts = 30;
    reasons.push("Prix sous la médiane historique");
  } else if (price <= s.p75) {
    pricePts = 15;
    reasons.push("Prix au-dessus de la médiane");
  } else if (price <= s.p90) {
    pricePts = 5;
    reasons.push("Prix dans le quart le plus cher");
  } else {
    pricePts = 0;
    reasons.push("Prix parmi les plus élevés jamais observés");
  }

  // ── Tendance (0-15) ────────────────────────────────────────────────────
  const trendPtsByDir: Record<TrendDirection, number> = { RISING: 15, STABLE: 8, FALLING: 0 };
  const dir = input.trendDirection;
  const trendPts = dir ? trendPtsByDir[dir] : 8;
  if (dir === "RISING") reasons.push("Tendance à la hausse — fenêtre qui se referme");
  else if (dir === "FALLING") reasons.push("Tendance à la baisse — patienter peut payer");

  // ── Urgence avant départ (0-15) ───────────────────────────────────────
  const d = input.daysUntilDeparture;
  let urgencyPts = 0;
  if (d !== null) {
    if (d <= 14) urgencyPts = 15;
    else if (d <= 30) urgencyPts = 11;
    else if (d <= 60) urgencyPts = 7;
    else if (d <= 120) urgencyPts = 3;
    if (d <= 30) reasons.push(`Départ proche (${String(d)} j) — peu de marge d'amélioration`);
  }

  // ── Cible / plafond (0-10) ────────────────────────────────────────────
  let targetPts = 0;
  if (input.targetEurCents != null && price <= input.targetEurCents) {
    targetPts = 10;
    reasons.push("Sous ton prix cible");
  } else if (input.maxEurCents != null && price <= input.maxEurCents) {
    targetPts = 4;
    reasons.push("Sous ton budget maximum");
  }

  const score = round(clamp(pricePts + trendPts + urgencyPts + targetPts, 0, 100));
  const priceVsMedianPct = s.median > 0 ? (price - s.median) / s.median : 0;

  return {
    score,
    band: bandOf(score),
    reasons,
    factors: { pricePts, trendPts, urgencyPts, targetPts, priceVsMedianPct },
  };
};

// ─── Recommandation de dates ───────────────────────────────────────────────

export interface DateRecommendation {
  readonly outboundDate: string;
  readonly returnDate: string | null;
  readonly tripDays: number | null;
  /** Dernier prix observé pour ce couple de dates. */
  readonly latestPriceEurCents: number;
  /** Meilleur prix jamais observé pour ce couple de dates. */
  readonly minPriceEurCents: number;
  readonly sampleSize: number;
  readonly reliable: boolean;
  /** Écart du dernier prix à la médiane globale de la recherche, en %. */
  readonly deltaVsMedianPct: number;
}

export interface RecommendDatesOptions {
  readonly top?: number;
  readonly minSampleSize?: number;
}

interface Bucket {
  outboundDate: string;
  returnDate: string | null;
  tripDays: number | null;
  prices: number[];
  latest: { at: string; price: number };
}

const bucketKey = (o: RecommendationObservation): string =>
  `${o.outboundDate}|${o.returnDate ?? ""}`;

/**
 * Top-N couples de dates les moins chers pour une recherche, à partir de ses
 * propres observations. Classement par dernier prix observé (départage : prix
 * minimum). Un couple sous-échantillonné reste listé mais `reliable: false`.
 */
export const recommendDates = (
  obs: readonly RecommendationObservation[],
  options: RecommendDatesOptions = {},
): DateRecommendation[] => {
  const top = options.top ?? 3;
  const minSample = options.minSampleSize ?? 5;
  const overallMedian = summarize(obs.map((o) => o.priceEurCents))?.median ?? 0;

  const buckets = new Map<string, Bucket>();
  for (const o of obs) {
    const id = bucketKey(o);
    const b = buckets.get(id) ?? {
      outboundDate: o.outboundDate,
      returnDate: o.returnDate,
      tripDays: o.tripDays,
      prices: [],
      latest: { at: o.observedAt, price: o.priceEurCents },
    };
    b.prices.push(o.priceEurCents);
    if (o.observedAt >= b.latest.at) b.latest = { at: o.observedAt, price: o.priceEurCents };
    buckets.set(id, b);
  }

  return [...buckets.values()]
    .map((b): DateRecommendation => {
      const latestPriceEurCents = b.latest.price;
      return {
        outboundDate: b.outboundDate,
        returnDate: b.returnDate,
        tripDays: b.tripDays,
        latestPriceEurCents,
        minPriceEurCents: Math.min(...b.prices),
        sampleSize: b.prices.length,
        reliable: b.prices.length >= minSample,
        deltaVsMedianPct:
          overallMedian > 0 ? (latestPriceEurCents - overallMedian) / overallMedian : 0,
      };
    })
    .sort(
      (a, z) =>
        a.latestPriceEurCents - z.latestPriceEurCents || a.minPriceEurCents - z.minPriceEurCents,
    )
    .slice(0, top);
};

// ─── Classement Radar (par destination) ───────────────────────────────────

export interface RadarDestinationRank {
  readonly destination: string;
  readonly latestPriceEurCents: number;
  readonly minPriceEurCents: number;
  /** Date de départ du meilleur prix observé. */
  readonly bestOutboundDate: string;
  readonly sampleSize: number;
  readonly reliable: boolean;
}

export interface RankRadarOptions {
  readonly minSampleSize?: number;
  readonly top?: number;
}

/**
 * Classe les destinations d'une recherche Radar par prix observé (dernier prix,
 * départage par prix minimum). Alimenté au fil des runs par le fan-out du worker.
 */
export const rankRadarDestinations = (
  obs: readonly RecommendationObservation[],
  options: RankRadarOptions = {},
): RadarDestinationRank[] => {
  const minSample = options.minSampleSize ?? 3;

  interface DestBucket {
    prices: number[];
    latest: { at: string; price: number };
    best: { price: number; outboundDate: string };
  }
  const buckets = new Map<string, DestBucket>();
  for (const o of obs) {
    if (!o.destination) continue;
    const b = buckets.get(o.destination) ?? {
      prices: [],
      latest: { at: o.observedAt, price: o.priceEurCents },
      best: { price: o.priceEurCents, outboundDate: o.outboundDate },
    };
    b.prices.push(o.priceEurCents);
    if (o.observedAt >= b.latest.at) b.latest = { at: o.observedAt, price: o.priceEurCents };
    if (o.priceEurCents < b.best.price)
      b.best = { price: o.priceEurCents, outboundDate: o.outboundDate };
    buckets.set(o.destination, b);
  }

  const ranks = [...buckets.entries()].map(([destination, b]): RadarDestinationRank => ({
    destination,
    latestPriceEurCents: b.latest.price,
    minPriceEurCents: b.best.price,
    bestOutboundDate: b.best.outboundDate,
    sampleSize: b.prices.length,
    reliable: b.prices.length >= minSample,
  }));

  ranks.sort(
    (a, z) =>
      a.latestPriceEurCents - z.latestPriceEurCents || a.minPriceEurCents - z.minPriceEurCents,
  );
  return options.top ? ranks.slice(0, options.top) : ranks;
};

// ─── Rapport agrégé ──────────────────────────────────────────────────────

export interface RecommendationReport {
  readonly currency: "EUR";
  readonly generatedAt: string;
  readonly sampleSize: number;
  readonly opportunity: OpportunityScore;
  readonly dates: DateRecommendation[];
  /** `null` hors mode Radar (une seule destination). */
  readonly radar: RadarDestinationRank[] | null;
}

export interface BuildRecommendationOptions {
  readonly now?: Date;
  /** Début de la fenêtre de départ (`YYYY-MM-DD`) — pour l'urgence. */
  readonly departureWindowStart?: string;
  readonly targetEurCents?: number | null;
  readonly maxEurCents?: number | null;
  readonly minSampleSize?: number;
  readonly topDates?: number;
  /** Force la section Radar même avec une seule destination. */
  readonly radar?: boolean;
}

const daysUntil = (from: Date, isoDay: string): number | null => {
  const target = Date.parse(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  return Math.round((target - from.getTime()) / 86_400_000);
};

/** Assemble score d'opportunité + top dates + classement Radar. Prix en centimes EUR. */
export const buildRecommendationReport = (
  obs: readonly RecommendationObservation[],
  options: BuildRecommendationOptions = {},
): RecommendationReport => {
  const now = options.now ?? new Date();
  const sorted = [...obs].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const prices = sorted.map((o) => o.priceEurCents);
  const summary = summarize(prices);
  const trend = computePriceTrend(
    sorted.map((o) => ({ at: o.observedAt, value: o.priceEurCents })),
  );
  const distinctDestinations = new Set(sorted.map((o) => o.destination)).size;

  const current = sorted.at(-1);
  const daysUntilDeparture = options.departureWindowStart
    ? daysUntil(now, options.departureWindowStart)
    : current
      ? daysUntil(now, current.outboundDate)
      : null;

  const opportunity = computeOpportunityScore({
    currentPriceEurCents: current?.priceEurCents ?? 0,
    summary,
    trendDirection: trend?.direction ?? null,
    daysUntilDeparture,
    targetEurCents: options.targetEurCents ?? null,
    maxEurCents: options.maxEurCents ?? null,
    sampleSize: prices.length,
    ...(options.minSampleSize !== undefined ? { minSampleSize: options.minSampleSize } : {}),
  });

  return {
    currency: "EUR",
    generatedAt: now.toISOString(),
    sampleSize: prices.length,
    opportunity,
    dates: recommendDates(sorted, {
      ...(options.topDates !== undefined ? { top: options.topDates } : {}),
    }),
    radar: options.radar || distinctDestinations > 1 ? rankRadarDestinations(sorted) : null,
  };
};
