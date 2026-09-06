import { addDays, compareIsoDate, isoDate, type IsoDate } from "@fbr/flight-domain";

export interface DateWindowInput {
  readonly departureWindowStart: string;
  readonly departureWindowEnd: string;
  readonly minTripDays: number;
  readonly maxTripDays: number;
}

export interface DateCombinationOptions {
  /** Pas entre deux dates de départ candidates (jours). Défaut 3. */
  readonly outboundStepDays?: number;
  /** Pas entre deux durées de séjour candidates (jours). Défaut 2. */
  readonly tripLengthStepDays?: number;
  /** Nombre maximum de combinaisons retournées (anti-explosion). Défaut 60. */
  readonly maxCombinations?: number;
  /** Date de référence pour la pondération « lead time ». Défaut = début de fenêtre. */
  readonly referenceDate?: string;
}

export interface DateCombination {
  readonly outboundDate: IsoDate;
  readonly returnDate: IsoDate;
  readonly tripDays: number;
  /** Score de priorité normalisé (0..1). */
  readonly priorityScore: number;
}

const DEFAULTS = { outboundStepDays: 3, tripLengthStepDays: 2, maxCombinations: 60 } as const;

const weekday = (d: IsoDate): number => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0=dim … 6=sam

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  if (out.at(-1) !== to) out.push(to); // toujours inclure la borne haute
  return out;
};

/**
 * Génère et priorise les combinaisons (date de départ, durée de séjour) d'une
 * recherche (Phase 0 §6). Contrôle l'explosion combinatoire : si l'énumération
 * brute dépasse largement `maxCombinations`, les pas sont élargis avant de
 * scorer, puis on ne conserve que le top-N.
 */
export const generateDateCombinations = (
  input: DateWindowInput,
  options: DateCombinationOptions = {},
): DateCombination[] => {
  const start = isoDate(input.departureWindowStart);
  const end = isoDate(input.departureWindowEnd);
  if (compareIsoDate(start, end) > 0) {
    throw new Error("generateDateCombinations: fenêtre de dates inversée");
  }
  if (input.minTripDays <= 0 || input.maxTripDays < input.minTripDays) {
    throw new Error("generateDateCombinations: durée de séjour invalide");
  }

  const maxCombinations = options.maxCombinations ?? DEFAULTS.maxCombinations;
  const reference = isoDate(options.referenceDate ?? input.departureWindowStart);

  const windowDays = daysInclusive(start, end);
  const tripSpan = input.maxTripDays - input.minTripDays;

  // Élargissement adaptatif des pas pour rester sous ~3× maxCombinations.
  let outboundStep = Math.max(1, options.outboundStepDays ?? DEFAULTS.outboundStepDays);
  let tripStep = Math.max(1, options.tripLengthStepDays ?? DEFAULTS.tripLengthStepDays);
  for (let guard = 0; guard < 8; guard += 1) {
    const estOutbound = Math.ceil(windowDays / outboundStep) + 1;
    const estTrip = Math.ceil(tripSpan / tripStep) + 1;
    if (estOutbound * estTrip <= maxCombinations * 3) break;
    outboundStep += 1;
    tripStep += 1;
  }

  const offsets = range(0, Math.max(0, windowDays - 1), outboundStep);
  const durations = range(input.minTripDays, input.maxTripDays, tripStep);
  const midTrip = (input.minTripDays + input.maxTripDays) / 2;

  const seen = new Set<string>();
  const combos: DateCombination[] = [];

  for (const dayOffset of offsets) {
    const outboundDate = addDays(start, dayOffset);
    for (const tripDays of durations) {
      const returnDate = addDays(outboundDate, tripDays);
      const key = `${outboundDate}|${returnDate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push({
        outboundDate,
        returnDate,
        tripDays,
        priorityScore: scoreCombination({
          outboundDate,
          tripDays,
          midTrip,
          tripSpan,
          reference,
          windowDays,
        }),
      });
    }
  }

  return combos
    .sort(
      (a, b) => b.priorityScore - a.priorityScore || compareIsoDate(a.outboundDate, b.outboundDate),
    )
    .slice(0, maxCombinations);
};

const daysInclusive = (a: IsoDate, b: IsoDate): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

interface ScoreInput {
  outboundDate: IsoDate;
  tripDays: number;
  midTrip: number;
  tripSpan: number;
  reference: IsoDate;
  windowDays: number;
}

/** Score 0..1 : ajustement durée + bonus week-end + lead time. */
const scoreCombination = (s: ScoreInput): number => {
  const tripFit =
    s.tripSpan === 0 ? 1 : 1 - Math.abs(s.tripDays - s.midTrip) / (s.tripSpan / 2 + 1);

  const wd = weekday(s.outboundDate);
  const weekendBonus = wd === 5 || wd === 6 ? 1 : wd === 4 || wd === 0 ? 0.5 : 0;

  const lead = Math.round(
    (Date.parse(`${s.outboundDate}T00:00:00Z`) - Date.parse(`${s.reference}T00:00:00Z`)) /
      86_400_000,
  );
  // Fenêtre de lead idéale ~ 21–75 jours : plus tôt = peu de recul, plus tard = peu de temps pour agir.
  const leadFit = lead < 14 ? 0.3 : lead > 120 ? 0.5 : 1;

  return clamp01(0.6 * clamp01(tripFit) + 0.25 * weekendBonus + 0.15 * leadFit);
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
