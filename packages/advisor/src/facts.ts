import { type AnalyticsReport, type RecommendationReport } from "@fbr/analytics";
import { type AdvisorInput } from "./types.js";

/** Métadonnées de recherche nécessaires à l'advisor (découplé de `@fbr/database`). */
export interface AdvisorSearchMeta {
  readonly origin: string;
  readonly destinations: readonly string[];
  readonly departureWindowStart: string;
  readonly departureWindowEnd: string;
  readonly minTripDays: number;
  readonly maxTripDays: number;
  readonly targetPriceCents: number | null;
  readonly maxPriceCents: number | null;
}

export interface BuildAdvisorInputArgs {
  readonly search: AdvisorSearchMeta;
  readonly analytics: AnalyticsReport;
  readonly recommendation: RecommendationReport;
  readonly now?: Date;
}

const daysUntil = (from: Date, isoDay: string): number | null => {
  const t = Date.parse(`${isoDay}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.round((t - from.getTime()) / 86_400_000);
};

/** Assemble le jeu de faits minimal remis à l'advisor. Prix en centimes EUR. */
export const buildAdvisorInput = (args: BuildAdvisorInputArgs): AdvisorInput => {
  const { search, analytics, recommendation } = args;
  const now = args.now ?? new Date();
  const s = analytics.summary;

  return {
    route: {
      origin: search.origin,
      destinations: [...search.destinations],
      radar: search.destinations.length === 0,
    },
    window: { start: search.departureWindowStart, end: search.departureWindowEnd },
    trip: { minDays: search.minTripDays, maxDays: search.maxTripDays },
    currency: "EUR",
    budget: { targetEurCents: search.targetPriceCents, maxEurCents: search.maxPriceCents },
    now: now.toISOString(),
    daysUntilDeparture: daysUntil(now, search.departureWindowStart),
    observations: analytics.sampleSize,
    price: {
      latestEurCents: analytics.latest?.priceEurCents ?? null,
      bestEverEurCents: analytics.best?.priceEurCents ?? null,
      meanEurCents: s ? Math.round(s.mean) : null,
      medianEurCents: s ? Math.round(s.median) : null,
      p10EurCents: s ? Math.round(s.p10) : null,
      p90EurCents: s ? Math.round(s.p90) : null,
    },
    trend: analytics.trend
      ? {
          direction: analytics.trend.direction,
          changePct: analytics.trend.changePct,
        }
      : null,
    opportunity: {
      score: recommendation.opportunity.score,
      band: recommendation.opportunity.band,
      reasons: [...recommendation.opportunity.reasons],
    },
    bestMonth: analytics.bestMonth
      ? {
          key: analytics.bestMonth.key,
          meanEurCents: analytics.bestMonth.meanEurCents,
          reliable: analytics.bestMonth.reliable,
        }
      : null,
    topDates: recommendation.dates.slice(0, 3).map((d) => ({
      outboundDate: d.outboundDate,
      returnDate: d.returnDate,
      latestEurCents: d.latestPriceEurCents,
      deltaVsMedianPct: d.deltaVsMedianPct,
    })),
    radarTop: (recommendation.radar ?? []).slice(0, 5).map((r) => ({
      destination: r.destination,
      latestEurCents: r.latestPriceEurCents,
      bestOutboundDate: r.bestOutboundDate,
    })),
  };
};

// ─── Périmètre autorisé pour le contrôle de non-invention ─────────────────

export interface AllowedValues {
  /** Montants en euros entiers (les prix sont affichés sans décimale). */
  readonly euros: ReadonlySet<number>;
  /** Pourcentages en valeur absolue, arrondis. */
  readonly percents: ReadonlySet<number>;
  /** Petits entiers cités en clair (jours, score, nb d'observations, durées). */
  readonly counts: ReadonlySet<number>;
  /** Dates ISO `AAAA-MM-JJ`. */
  readonly isoDates: ReadonlySet<string>;
}

const euro = (cents: number | null): number | null =>
  cents === null ? null : Math.round(cents / 100);

/**
 * Dérive du jeu de faits l'ensemble **exact** des valeurs qu'un conseil peut
 * citer. Tout chiffre marqué (`€`, `%`, date ISO) absent de cet ensemble est
 * considéré comme inventé.
 */
export const collectAllowedValues = (input: AdvisorInput): AllowedValues => {
  const euros = new Set<number>();
  const percents = new Set<number>();
  const counts = new Set<number>();
  const isoDates = new Set<string>();

  const addEuro = (cents: number | null): void => {
    const e = euro(cents);
    if (e !== null) {
      euros.add(e);
      euros.add(e + 1);
      euros.add(e - 1); // tolérance d'arrondi à l'affichage
    }
  };
  const addPct = (frac: number | null | undefined): void => {
    if (frac === null || frac === undefined) return;
    const p = Math.round(Math.abs(frac) * 100);
    percents.add(p);
    percents.add(p + 1);
    percents.add(p - 1);
  };
  const addDate = (d: string | null | undefined): void => {
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) isoDates.add(d);
  };

  for (const c of [
    input.price.latestEurCents,
    input.price.bestEverEurCents,
    input.price.meanEurCents,
    input.price.medianEurCents,
    input.price.p10EurCents,
    input.price.p90EurCents,
    input.budget.targetEurCents,
    input.budget.maxEurCents,
    input.bestMonth?.meanEurCents ?? null,
  ]) {
    addEuro(c);
  }
  for (const d of input.topDates) {
    addEuro(d.latestEurCents);
    addPct(d.deltaVsMedianPct);
    addDate(d.outboundDate);
    addDate(d.returnDate);
  }
  for (const r of input.radarTop) {
    addEuro(r.latestEurCents);
    addDate(r.bestOutboundDate);
  }

  addPct(input.trend?.changePct);

  counts.add(100); // échelle du score d'opportunité (« /100 »)
  for (const n of [
    input.daysUntilDeparture,
    input.observations,
    input.opportunity.score,
    input.trip.minDays,
    input.trip.maxDays,
  ]) {
    if (n !== null) counts.add(n);
  }

  addDate(input.window.start);
  addDate(input.window.end);
  addDate(input.now.slice(0, 10));
  if (input.bestMonth) addDate(`${input.bestMonth.key}-01`);

  return { euros, percents, counts, isoDates };
};
