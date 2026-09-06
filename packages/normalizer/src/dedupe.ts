import { type Availability, type FlightOffer } from "@fbr/flight-domain";

export interface DedupeOptions {
  /** Ordre de préférence des providers en cas d'égalité de prix. */
  readonly preferProviders?: readonly string[];
}

export interface DedupeResult {
  /** Une offre par empreinte (la « meilleure »). */
  readonly kept: FlightOffer[];
  /** Les offres écartées comme doublons. */
  readonly duplicates: FlightOffer[];
}

const AVAILABILITY_RANK: Record<Availability, number> = {
  AVAILABLE: 0,
  LOW: 1,
  WAITLIST: 2,
  UNKNOWN: 3,
};

/**
 * Deux providers peuvent renvoyer le même vol (Phase 0 §30). On regroupe par
 * `fingerprint` et on conserve la meilleure offre du groupe :
 * 1. prix le plus bas ; 2. provider préféré ; 3. meilleure disponibilité ;
 * 4. observation la plus récente ; 5. nom de provider (déterminisme).
 */
export const dedupeOffers = (
  offers: readonly FlightOffer[],
  options: DedupeOptions = {},
): DedupeResult => {
  const preference = new Map((options.preferProviders ?? []).map((name, i) => [name, i]));
  const rankProvider = (name: string): number => preference.get(name) ?? Number.MAX_SAFE_INTEGER;

  const groups = new Map<string, FlightOffer[]>();
  for (const offer of offers) {
    const bucket = groups.get(offer.fingerprint);
    if (bucket) bucket.push(offer);
    else groups.set(offer.fingerprint, [offer]);
  }

  const kept: FlightOffer[] = [];
  const duplicates: FlightOffer[] = [];

  for (const bucket of groups.values()) {
    const sorted = [...bucket].sort(
      (a, b) =>
        a.price.amount - b.price.amount ||
        rankProvider(a.provider) - rankProvider(b.provider) ||
        AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability] ||
        Date.parse(b.observedAt) - Date.parse(a.observedAt) ||
        a.provider.localeCompare(b.provider),
    );
    const [best, ...rest] = sorted;
    if (best) kept.push(best);
    duplicates.push(...rest);
  }

  return { kept, duplicates };
};
