import { type AdvisorInput } from "./types.js";

/** Jeu de faits « riche » : historique fourni, bon prix, tendance à la baisse. */
export const richInput = (over: Partial<AdvisorInput> = {}): AdvisorInput => ({
  route: { origin: "CDG", destinations: ["HND"], radar: false },
  window: { start: "2026-11-10", end: "2026-11-24" },
  trip: { minDays: 12, maxDays: 14 },
  currency: "EUR",
  budget: { targetEurCents: 130_000, maxEurCents: 180_000 },
  now: "2026-10-01T09:00:00.000Z",
  daysUntilDeparture: 40,
  observations: 120,
  price: {
    latestEurCents: 118_000,
    bestEverEurCents: 112_000,
    meanEurCents: 145_000,
    medianEurCents: 142_000,
    p10EurCents: 121_000,
    p90EurCents: 172_000,
  },
  trend: { direction: "FALLING", changePct: -0.08 },
  opportunity: {
    score: 78,
    band: "GOOD",
    reasons: ["Prix sous le 10ᵉ percentile historique", "Sous ton prix cible"],
  },
  bestMonth: { key: "2026-11", meanEurCents: 138_000, reliable: true },
  topDates: [
    {
      outboundDate: "2026-11-17",
      returnDate: "2026-11-29",
      latestEurCents: 118_000,
      deltaVsMedianPct: -0.169,
    },
    {
      outboundDate: "2026-11-10",
      returnDate: "2026-11-22",
      latestEurCents: 124_000,
      deltaVsMedianPct: -0.126,
    },
  ],
  radarTop: [],
  ...over,
});

/** Jeu de faits « maigre » : trop peu d'observations pour conseiller. */
export const thinInput = (): AdvisorInput =>
  richInput({
    observations: 6,
    opportunity: {
      score: null,
      band: "INSUFFICIENT_DATA",
      reasons: ["Historique insuffisant (6 obs, minimum 30)"],
    },
    trend: null,
  });

/** Jeu de faits Radar : plusieurs destinations classées. */
export const radarInput = (): AdvisorInput =>
  richInput({
    route: { origin: "CDG", destinations: [], radar: true },
    radarTop: [
      { destination: "JFK", latestEurCents: 96_000, bestOutboundDate: "2026-11-12" },
      { destination: "DXB", latestEurCents: 108_000, bestOutboundDate: "2026-11-14" },
    ],
  });
