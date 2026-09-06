export type SearchPriority = "HIGH" | "MEDIUM" | "LOW";

export interface PriorityContext {
  /** Jours avant le début de la fenêtre de départ (négatif si déjà commencée). */
  readonly daysUntilWindowStart: number;
  readonly hasOffers: boolean;
  readonly bestPriceCents?: number;
  readonly targetPriceCents?: number;
  readonly maxPriceCents?: number;
  /** Baisse relative récente observée (0.1 = -10 %). */
  readonly recentDropPct?: number;
}

const RANK: Record<SearchPriority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const highest = (a: SearchPriority, b: SearchPriority): SearchPriority =>
  RANK[a] >= RANK[b] ? a : b;

/**
 * Priorité d'une recherche pour le scheduler (Phase 0 §36). Combine plusieurs
 * signaux et retient le niveau le plus élevé déclenché.
 */
export const computeSearchPriority = (ctx: PriorityContext): SearchPriority => {
  let priority: SearchPriority = "LOW";

  const best = ctx.bestPriceCents;
  const target = ctx.targetPriceCents;
  const max = ctx.maxPriceCents;

  if (ctx.hasOffers && best !== undefined) {
    if (target !== undefined && best <= target) priority = "HIGH";
    else if (target !== undefined && best <= target * 1.12) priority = highest(priority, "HIGH");
    else if (max !== undefined && best <= max) priority = highest(priority, "MEDIUM");
    else priority = highest(priority, "MEDIUM"); // des offres existent : au moins MEDIUM
  }

  if ((ctx.recentDropPct ?? 0) >= 0.08) priority = "HIGH";

  if (ctx.daysUntilWindowStart <= 14 && ctx.daysUntilWindowStart >= -30) {
    priority = highest(priority, "MEDIUM");
  }

  return priority;
};
