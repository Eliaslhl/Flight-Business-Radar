import { createHash } from "node:crypto";
import { type CabinClass } from "./cabin.js";

/** Trajet réduit aux champs qui définissent l'identité d'une offre. */
export interface FingerprintLeg {
  readonly departureDate: string;
  readonly departureAt: string;
  readonly marketingAirline: string;
  readonly flightNumbers: readonly string[];
  readonly stops: number;
}

export interface FingerprintInput {
  readonly origin: string;
  readonly destination: string;
  readonly cabinClass: CabinClass;
  readonly outbound: FingerprintLeg;
  readonly inbound?: FingerprintLeg | null;
}

/** Arrondit un instant ISO à la tranche de 5 minutes (tolère les micro-écarts providers). */
const bucket5min = (iso: string): string => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(Math.round(t / 300_000) * 300_000).toISOString();
};

const legKey = (leg: FingerprintLeg): string => {
  const numbers = [...leg.flightNumbers].map((n) => n.toUpperCase()).sort();
  // Si le provider ne fournit pas les numéros de vol, on retombe sur
  // (compagnie + heure de départ arrondie + escales) — stratégie robuste (Phase 0 §30).
  const identity =
    numbers.length > 0
      ? numbers.join(",")
      : `${leg.marketingAirline}@${bucket5min(leg.departureAt)}/${String(leg.stops)}`;
  return `${leg.departureDate}|${identity}`;
};

/**
 * Empreinte stable d'une offre, indépendante du provider et du prix.
 * Deux offres identiques (même itinéraire, mêmes dates, même cabine) partagent
 * la même empreinte → cible de déduplication et clé de l'historique de prix.
 */
export const computeFingerprint = (input: FingerprintInput): string => {
  const parts = [
    input.origin.toUpperCase(),
    input.destination.toUpperCase(),
    input.cabinClass,
    legKey(input.outbound),
    input.inbound ? legKey(input.inbound) : "ONEWAY",
  ];
  const hash = createHash("sha1").update(parts.join("::")).digest("hex").slice(0, 20);
  return `fbr_${hash}`;
};
