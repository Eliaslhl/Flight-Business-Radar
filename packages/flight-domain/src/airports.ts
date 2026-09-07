/**
 * Liste seed des destinations long-courrier au départ de Paris-CDG (Phase 0
 * décision §7 — « fournir une liste seed de ~40-60 villes »).
 *
 * Sert au **mode Radar** (recherche sans destination imposée) : le worker sonde
 * une tranche rotative de cette liste, l'analytics classe ensuite les
 * destinations par prix observé.
 *
 * Données de référence statiques (aucune I/O, aucune table) : c'est un point de
 * départ éditable, pas un référentiel aéroportuaire exhaustif.
 */
export type WorldRegion =
  | "ASIA"
  | "NORTH_AMERICA"
  | "SOUTH_AMERICA"
  | "MIDDLE_EAST"
  | "AFRICA"
  | "OCEANIA"
  | "INDIAN_OCEAN";

export interface SeedAirport {
  readonly iata: string;
  readonly city: string;
  readonly country: string;
  readonly region: WorldRegion;
}

/** ~50 aéroports intercontinentaux desservis en Business au départ de CDG. */
export const CDG_LONGHAUL_DESTINATIONS: readonly SeedAirport[] = [
  // Asie
  { iata: "HND", city: "Tokyo", country: "Japon", region: "ASIA" },
  { iata: "NRT", city: "Tokyo", country: "Japon", region: "ASIA" },
  { iata: "KIX", city: "Osaka", country: "Japon", region: "ASIA" },
  { iata: "ICN", city: "Séoul", country: "Corée du Sud", region: "ASIA" },
  { iata: "PEK", city: "Pékin", country: "Chine", region: "ASIA" },
  { iata: "PVG", city: "Shanghai", country: "Chine", region: "ASIA" },
  { iata: "CAN", city: "Canton", country: "Chine", region: "ASIA" },
  { iata: "HKG", city: "Hong Kong", country: "Hong Kong", region: "ASIA" },
  { iata: "TPE", city: "Taipei", country: "Taïwan", region: "ASIA" },
  { iata: "SIN", city: "Singapour", country: "Singapour", region: "ASIA" },
  { iata: "BKK", city: "Bangkok", country: "Thaïlande", region: "ASIA" },
  { iata: "KUL", city: "Kuala Lumpur", country: "Malaisie", region: "ASIA" },
  { iata: "CGK", city: "Jakarta", country: "Indonésie", region: "ASIA" },
  { iata: "DEL", city: "New Delhi", country: "Inde", region: "ASIA" },
  { iata: "BOM", city: "Mumbai", country: "Inde", region: "ASIA" },
  { iata: "BLR", city: "Bangalore", country: "Inde", region: "ASIA" },
  { iata: "SGN", city: "Hô Chi Minh-Ville", country: "Viêt Nam", region: "ASIA" },
  { iata: "MNL", city: "Manille", country: "Philippines", region: "ASIA" },
  // Moyen-Orient
  { iata: "DXB", city: "Dubaï", country: "Émirats arabes unis", region: "MIDDLE_EAST" },
  { iata: "AUH", city: "Abou Dabi", country: "Émirats arabes unis", region: "MIDDLE_EAST" },
  { iata: "DOH", city: "Doha", country: "Qatar", region: "MIDDLE_EAST" },
  { iata: "RUH", city: "Riyad", country: "Arabie saoudite", region: "MIDDLE_EAST" },
  { iata: "TLV", city: "Tel Aviv", country: "Israël", region: "MIDDLE_EAST" },
  // Amérique du Nord
  { iata: "JFK", city: "New York", country: "États-Unis", region: "NORTH_AMERICA" },
  { iata: "EWR", city: "Newark", country: "États-Unis", region: "NORTH_AMERICA" },
  { iata: "BOS", city: "Boston", country: "États-Unis", region: "NORTH_AMERICA" },
  { iata: "IAD", city: "Washington", country: "États-Unis", region: "NORTH_AMERICA" },
  { iata: "ORD", city: "Chicago", country: "États-Unis", region: "NORTH_AMERICA" },
  { iata: "MIA", city: "Miami", country: "États-Unis", region: "NORTH_AMERICA" },
  { iata: "ATL", city: "Atlanta", country: "États-Unis", region: "NORTH_AMERICA" },
  { iata: "LAX", city: "Los Angeles", country: "États-Unis", region: "NORTH_AMERICA" },
  { iata: "SFO", city: "San Francisco", country: "États-Unis", region: "NORTH_AMERICA" },
  { iata: "SEA", city: "Seattle", country: "États-Unis", region: "NORTH_AMERICA" },
  { iata: "YUL", city: "Montréal", country: "Canada", region: "NORTH_AMERICA" },
  { iata: "YYZ", city: "Toronto", country: "Canada", region: "NORTH_AMERICA" },
  { iata: "MEX", city: "Mexico", country: "Mexique", region: "NORTH_AMERICA" },
  // Amérique du Sud
  { iata: "GRU", city: "São Paulo", country: "Brésil", region: "SOUTH_AMERICA" },
  { iata: "GIG", city: "Rio de Janeiro", country: "Brésil", region: "SOUTH_AMERICA" },
  { iata: "EZE", city: "Buenos Aires", country: "Argentine", region: "SOUTH_AMERICA" },
  { iata: "SCL", city: "Santiago", country: "Chili", region: "SOUTH_AMERICA" },
  { iata: "BOG", city: "Bogota", country: "Colombie", region: "SOUTH_AMERICA" },
  { iata: "LIM", city: "Lima", country: "Pérou", region: "SOUTH_AMERICA" },
  // Afrique
  { iata: "CMN", city: "Casablanca", country: "Maroc", region: "AFRICA" },
  { iata: "CAI", city: "Le Caire", country: "Égypte", region: "AFRICA" },
  { iata: "JNB", city: "Johannesbourg", country: "Afrique du Sud", region: "AFRICA" },
  { iata: "CPT", city: "Le Cap", country: "Afrique du Sud", region: "AFRICA" },
  { iata: "NBO", city: "Nairobi", country: "Kenya", region: "AFRICA" },
  { iata: "ABJ", city: "Abidjan", country: "Côte d'Ivoire", region: "AFRICA" },
  { iata: "DKR", city: "Dakar", country: "Sénégal", region: "AFRICA" },
  // Océan Indien
  { iata: "RUN", city: "Saint-Denis", country: "La Réunion", region: "INDIAN_OCEAN" },
  { iata: "MRU", city: "Port-Louis", country: "Maurice", region: "INDIAN_OCEAN" },
  // Océanie
  { iata: "SYD", city: "Sydney", country: "Australie", region: "OCEANIA" },
  { iata: "MEL", city: "Melbourne", country: "Australie", region: "OCEANIA" },
];

const BY_IATA: ReadonlyMap<string, SeedAirport> = new Map(
  CDG_LONGHAUL_DESTINATIONS.map((a) => [a.iata, a]),
);

/** Retourne la fiche d'un aéroport de la liste seed, ou `undefined`. */
export const findSeedAirport = (iata: string): SeedAirport | undefined =>
  BY_IATA.get(iata.toUpperCase());

/** `true` si le code fait partie de la liste seed CDG long-courrier. */
export const isSeedDestination = (iata: string): boolean => BY_IATA.has(iata.toUpperCase());

/** Codes IATA seuls (ordre stable de `CDG_LONGHAUL_DESTINATIONS`). */
export const SEED_DESTINATION_CODES: readonly string[] = CDG_LONGHAUL_DESTINATIONS.map(
  (a) => a.iata,
);

/**
 * Tranche rotative de `count` destinations à sonder pour ce tour de Radar.
 * `offset` (typiquement dérivé de l'horloge) fait défiler la liste : sur
 * plusieurs runs, toutes les destinations finissent couvertes.
 */
export const radarDestinationSlice = (offset: number, count: number): string[] => {
  const n = SEED_DESTINATION_CODES.length;
  if (count >= n) return [...SEED_DESTINATION_CODES];
  const start = ((offset % n) + n) % n;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(SEED_DESTINATION_CODES[(start + i) % n]!);
  }
  return out;
};
