/**
 * Dérivation des événements de prix (Phase 0 §9/§10). Pur : compare le nouveau
 * snapshot au précédent + à l'historique agrégé, applique des filtres
 * anti-faux-positifs, renvoie les événements candidats. La **confirmation** et
 * les **notifications** sont gérées en Phase 5.
 */

export const PRICE_EVENT_TYPES = [
  "DROP",
  "FLASH_DROP",
  "RISE",
  "RECORD_LOW",
  "RECORD_HIGH",
  "TARGET_HIT",
  "UNUSUAL",
] as const;

export type PriceEventType = (typeof PRICE_EVENT_TYPES)[number];

export interface DropThresholds {
  /** Baisse relative min pour un `DROP`. Défaut 5 %. */
  readonly priceDropPct: number;
  /** Baisse relative min pour un `FLASH_DROP`. Défaut 12 %. */
  readonly flashDropPct: number;
  /** Baisse absolue min (centimes EUR) pour un `FLASH_DROP`. Défaut 12 000 (120 €). */
  readonly flashDropAbsCents: number;
  /** Fenêtre max entre deux snapshots pour parler de « flash ». Défaut 90 min. */
  readonly flashWindowMinutes: number;
  /** Hausse relative min pour un `RISE`. Défaut 5 %. */
  readonly risePct: number;
  /** Nombre d'observations min avant de déclarer un prix `UNUSUAL`. Défaut 30. */
  readonly unusualMinSample: number;
  /** Bande de plausibilité (centimes EUR) — hors bande ⇒ aucun événement. */
  readonly plausibleMinCents: number;
  readonly plausibleMaxCents: number;
}

export const DEFAULT_DROP_THRESHOLDS: DropThresholds = {
  priceDropPct: 0.05,
  flashDropPct: 0.12,
  flashDropAbsCents: 12_000,
  flashWindowMinutes: 90,
  risePct: 0.05,
  unusualMinSample: 30,
  plausibleMinCents: 15_000,
  plausibleMaxCents: 2_500_000,
};

export interface SnapshotRef {
  readonly id: number;
  readonly priceEurCents: number;
  readonly observedAt: string;
}

export interface DeriveEventsContext {
  readonly current: SnapshotRef;
  readonly previous?: SnapshotRef | null;
  readonly minEverEurCents?: number;
  readonly maxEverEurCents?: number;
  readonly p10EurCents?: number;
  readonly targetEurCents?: number;
  /** Nombre total d'observations pour cette offre (incluant la courante). */
  readonly observationCount: number;
}

export interface DerivedEvent {
  readonly type: PriceEventType;
  readonly previousPriceEurCents: number | null;
  readonly newPriceEurCents: number;
  /** Positif = baisse (centimes EUR). `null` si pas de précédent. */
  readonly dropAmountEurCents: number | null;
  readonly dropPct: number | null;
  readonly previousSnapshotId: number | null;
  readonly newSnapshotId: number;
}

export interface DropAnalysis {
  readonly dropAmountEurCents: number;
  readonly dropPct: number;
  readonly minutesBetween: number;
}

/** Analyse brute entre deux prix consécutifs (positif = baisse). `null` si prix de départ nul. */
export const analyzeDrop = (previous: SnapshotRef, current: SnapshotRef): DropAnalysis | null => {
  if (previous.priceEurCents <= 0) return null;
  const dropAmountEurCents = previous.priceEurCents - current.priceEurCents;
  const dropPct = dropAmountEurCents / previous.priceEurCents;
  const minutesBetween =
    (Date.parse(current.observedAt) - Date.parse(previous.observedAt)) / 60_000;
  return { dropAmountEurCents, dropPct, minutesBetween };
};

export const derivePriceEvents = (
  ctx: DeriveEventsContext,
  thresholds: DropThresholds = DEFAULT_DROP_THRESHOLDS,
): DerivedEvent[] => {
  const price = ctx.current.priceEurCents;

  // Filtre de plausibilité : un prix corrompu ne génère aucun événement (Phase 0 §29).
  if (price < thresholds.plausibleMinCents || price > thresholds.plausibleMaxCents) return [];

  const types = new Set<PriceEventType>();
  let dropAmount: number | null = null;
  let dropPct: number | null = null;

  if (ctx.previous) {
    const analysis = analyzeDrop(ctx.previous, ctx.current);
    if (analysis) {
      dropAmount = analysis.dropAmountEurCents;
      dropPct = analysis.dropPct;

      const isFlash =
        analysis.dropPct >= thresholds.flashDropPct &&
        analysis.dropAmountEurCents >= thresholds.flashDropAbsCents &&
        analysis.minutesBetween >= 0 &&
        analysis.minutesBetween <= thresholds.flashWindowMinutes;

      if (isFlash) {
        types.add("FLASH_DROP");
        types.add("DROP");
      } else if (analysis.dropPct >= thresholds.priceDropPct) {
        types.add("DROP");
      } else if (-analysis.dropPct >= thresholds.risePct) {
        types.add("RISE");
      }
    }
  }

  if (ctx.minEverEurCents !== undefined && price < ctx.minEverEurCents) types.add("RECORD_LOW");
  if (ctx.maxEverEurCents !== undefined && price > ctx.maxEverEurCents) types.add("RECORD_HIGH");
  if (ctx.targetEurCents !== undefined && price <= ctx.targetEurCents) types.add("TARGET_HIT");
  if (
    ctx.p10EurCents !== undefined &&
    ctx.observationCount >= thresholds.unusualMinSample &&
    price < ctx.p10EurCents
  ) {
    types.add("UNUSUAL");
  }

  return [...types].map((type) => ({
    type,
    previousPriceEurCents: ctx.previous?.priceEurCents ?? null,
    newPriceEurCents: price,
    dropAmountEurCents: dropAmount,
    dropPct,
    previousSnapshotId: ctx.previous?.id ?? null,
    newSnapshotId: ctx.current.id,
  }));
};
