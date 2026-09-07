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

/** Codes IATA de la liste seed pour une région donnée (ordre stable). */
export const seedCodesForRegion = (region: WorldRegion): string[] =>
  CDG_LONGHAUL_DESTINATIONS.filter((a) => a.region === region).map((a) => a.iata);

// ─── Pays → code ISO / drapeau ──────────────────────────────────────────

/**
 * Nom de pays (en français, tel qu'écrit dans ce fichier) → code ISO 3166-1
 * alpha-2. Sert à afficher un drapeau à côté d'une ville / d'un pays.
 */
export const COUNTRY_CODE: Readonly<Record<string, string>> = {
  "Afrique du Sud": "ZA",
  Algérie: "DZ",
  Allemagne: "DE",
  "Arabie saoudite": "SA",
  Argentine: "AR",
  Australie: "AU",
  Autriche: "AT",
  Bahreïn: "BH",
  Bangladesh: "BD",
  Belgique: "BE",
  Brésil: "BR",
  Bulgarie: "BG",
  Canada: "CA",
  Chili: "CL",
  Chine: "CN",
  Colombie: "CO",
  "Corée du Sud": "KR",
  Croatie: "HR",
  Cuba: "CU",
  "Côte d'Ivoire": "CI",
  Danemark: "DK",
  Espagne: "ES",
  Fidji: "FJ",
  Finlande: "FI",
  France: "FR",
  Ghana: "GH",
  Grèce: "GR",
  Guadeloupe: "GP",
  Guyane: "GF",
  "Hong Kong": "HK",
  Hongrie: "HU",
  Inde: "IN",
  Indonésie: "ID",
  Irlande: "IE",
  Islande: "IS",
  Israël: "IL",
  Italie: "IT",
  Japon: "JP",
  Jordanie: "JO",
  Kazakhstan: "KZ",
  Kenya: "KE",
  Koweït: "KW",
  "La Réunion": "RE",
  Liban: "LB",
  Luxembourg: "LU",
  Malaisie: "MY",
  Maldives: "MV",
  Malte: "MT",
  Maroc: "MA",
  Martinique: "MQ",
  Maurice: "MU",
  Mexique: "MX",
  Nigeria: "NG",
  Norvège: "NO",
  "Nouvelle-Calédonie": "NC",
  "Nouvelle-Zélande": "NZ",
  Népal: "NP",
  Oman: "OM",
  Panama: "PA",
  "Pays-Bas": "NL",
  Philippines: "PH",
  Pologne: "PL",
  "Polynésie française": "PF",
  Portugal: "PT",
  Pérou: "PE",
  Qatar: "QA",
  Roumanie: "RO",
  "Royaume-Uni": "GB",
  Serbie: "RS",
  Seychelles: "SC",
  Singapour: "SG",
  "Sri Lanka": "LK",
  Suisse: "CH",
  Suède: "SE",
  Sénégal: "SN",
  Tanzanie: "TZ",
  Taïwan: "TW",
  Tchéquie: "CZ",
  Thaïlande: "TH",
  Tunisie: "TN",
  Turquie: "TR",
  "Viêt Nam": "VN",
  Égypte: "EG",
  "Émirats arabes unis": "AE",
  Équateur: "EC",
  "États-Unis": "US",
  Éthiopie: "ET",
};

/** Code ISO 3166-1 alpha-2 du pays, ou `""` si inconnu. */
export const countryCodeOf = (country: string): string => COUNTRY_CODE[country] ?? "";

/**
 * Emoji drapeau à partir d'un code ISO 3166-1 alpha-2 (paire d'indicateurs
 * régionaux Unicode). `""` si le code est invalide.
 */
export const flagEmoji = (iso2: string): string => {
  const c = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
};

// ─── Référentiel d'aéroports (autocomplétion) ────────────────────────────

export interface Airport {
  readonly iata: string;
  readonly city: string;
  readonly country: string;
}

/**
 * Liste **curée** d'aéroports pour l'autocomplétion des champs origine /
 * destination du dashboard (~120 entrées : hubs européens + toutes les
 * destinations long-courrier de la liste seed + grands hubs mondiaux).
 * Données de référence statiques, pas un référentiel OACI exhaustif.
 */
export const WORLD_AIRPORTS: readonly Airport[] = [
  // France & DOM-TOM
  { iata: "CDG", city: "Paris", country: "France" },
  { iata: "ORY", city: "Paris", country: "France" },
  { iata: "BVA", city: "Paris Beauvais", country: "France" },
  { iata: "NCE", city: "Nice", country: "France" },
  { iata: "LYS", city: "Lyon", country: "France" },
  { iata: "MRS", city: "Marseille", country: "France" },
  { iata: "TLS", city: "Toulouse", country: "France" },
  { iata: "BOD", city: "Bordeaux", country: "France" },
  { iata: "NTE", city: "Nantes", country: "France" },
  { iata: "LIL", city: "Lille", country: "France" },
  { iata: "SXB", city: "Strasbourg", country: "France" },
  { iata: "MPL", city: "Montpellier", country: "France" },
  { iata: "BIQ", city: "Biarritz", country: "France" },
  { iata: "AJA", city: "Ajaccio", country: "France" },
  { iata: "PTP", city: "Pointe-à-Pitre", country: "Guadeloupe" },
  { iata: "FDF", city: "Fort-de-France", country: "Martinique" },
  { iata: "RUN", city: "Saint-Denis", country: "La Réunion" },
  { iata: "CAY", city: "Cayenne", country: "Guyane" },
  { iata: "PPT", city: "Papeete", country: "Polynésie française" },
  { iata: "NOU", city: "Nouméa", country: "Nouvelle-Calédonie" },
  // Îles britanniques
  { iata: "LHR", city: "Londres Heathrow", country: "Royaume-Uni" },
  { iata: "LGW", city: "Londres Gatwick", country: "Royaume-Uni" },
  { iata: "STN", city: "Londres Stansted", country: "Royaume-Uni" },
  { iata: "LCY", city: "Londres City", country: "Royaume-Uni" },
  { iata: "MAN", city: "Manchester", country: "Royaume-Uni" },
  { iata: "EDI", city: "Édimbourg", country: "Royaume-Uni" },
  { iata: "BHX", city: "Birmingham", country: "Royaume-Uni" },
  { iata: "DUB", city: "Dublin", country: "Irlande" },
  // Europe de l'Ouest / du Nord
  { iata: "AMS", city: "Amsterdam", country: "Pays-Bas" },
  { iata: "BRU", city: "Bruxelles", country: "Belgique" },
  { iata: "LUX", city: "Luxembourg", country: "Luxembourg" },
  { iata: "FRA", city: "Francfort", country: "Allemagne" },
  { iata: "MUC", city: "Munich", country: "Allemagne" },
  { iata: "BER", city: "Berlin", country: "Allemagne" },
  { iata: "DUS", city: "Düsseldorf", country: "Allemagne" },
  { iata: "HAM", city: "Hambourg", country: "Allemagne" },
  { iata: "STR", city: "Stuttgart", country: "Allemagne" },
  { iata: "CGN", city: "Cologne", country: "Allemagne" },
  { iata: "ZRH", city: "Zurich", country: "Suisse" },
  { iata: "GVA", city: "Genève", country: "Suisse" },
  { iata: "BSL", city: "Bâle-Mulhouse", country: "Suisse" },
  { iata: "VIE", city: "Vienne", country: "Autriche" },
  { iata: "CPH", city: "Copenhague", country: "Danemark" },
  { iata: "ARN", city: "Stockholm", country: "Suède" },
  { iata: "OSL", city: "Oslo", country: "Norvège" },
  { iata: "HEL", city: "Helsinki", country: "Finlande" },
  { iata: "KEF", city: "Reykjavik", country: "Islande" },
  // Europe du Sud
  { iata: "MAD", city: "Madrid", country: "Espagne" },
  { iata: "BCN", city: "Barcelone", country: "Espagne" },
  { iata: "AGP", city: "Malaga", country: "Espagne" },
  { iata: "PMI", city: "Palma de Majorque", country: "Espagne" },
  { iata: "VLC", city: "Valence", country: "Espagne" },
  { iata: "SVQ", city: "Séville", country: "Espagne" },
  { iata: "LIS", city: "Lisbonne", country: "Portugal" },
  { iata: "OPO", city: "Porto", country: "Portugal" },
  { iata: "FNC", city: "Madère", country: "Portugal" },
  { iata: "FCO", city: "Rome", country: "Italie" },
  { iata: "MXP", city: "Milan Malpensa", country: "Italie" },
  { iata: "LIN", city: "Milan Linate", country: "Italie" },
  { iata: "VCE", city: "Venise", country: "Italie" },
  { iata: "NAP", city: "Naples", country: "Italie" },
  { iata: "BLQ", city: "Bologne", country: "Italie" },
  { iata: "CTA", city: "Catane", country: "Italie" },
  { iata: "ATH", city: "Athènes", country: "Grèce" },
  { iata: "HER", city: "Héraklion", country: "Grèce" },
  { iata: "MLA", city: "Malte", country: "Malte" },
  // Europe centrale / de l'Est
  { iata: "WAW", city: "Varsovie", country: "Pologne" },
  { iata: "KRK", city: "Cracovie", country: "Pologne" },
  { iata: "PRG", city: "Prague", country: "Tchéquie" },
  { iata: "BUD", city: "Budapest", country: "Hongrie" },
  { iata: "OTP", city: "Bucarest", country: "Roumanie" },
  { iata: "SOF", city: "Sofia", country: "Bulgarie" },
  { iata: "ZAG", city: "Zagreb", country: "Croatie" },
  { iata: "BEG", city: "Belgrade", country: "Serbie" },
  { iata: "IST", city: "Istanbul", country: "Turquie" },
  { iata: "SAW", city: "Istanbul Sabiha", country: "Turquie" },
  { iata: "AYT", city: "Antalya", country: "Turquie" },
  // Amérique du Nord
  { iata: "JFK", city: "New York JFK", country: "États-Unis" },
  { iata: "EWR", city: "Newark", country: "États-Unis" },
  { iata: "LGA", city: "New York LaGuardia", country: "États-Unis" },
  { iata: "BOS", city: "Boston", country: "États-Unis" },
  { iata: "IAD", city: "Washington Dulles", country: "États-Unis" },
  { iata: "PHL", city: "Philadelphie", country: "États-Unis" },
  { iata: "ORD", city: "Chicago O'Hare", country: "États-Unis" },
  { iata: "ATL", city: "Atlanta", country: "États-Unis" },
  { iata: "MIA", city: "Miami", country: "États-Unis" },
  { iata: "MCO", city: "Orlando", country: "États-Unis" },
  { iata: "DFW", city: "Dallas", country: "États-Unis" },
  { iata: "IAH", city: "Houston", country: "États-Unis" },
  { iata: "DEN", city: "Denver", country: "États-Unis" },
  { iata: "LAX", city: "Los Angeles", country: "États-Unis" },
  { iata: "SFO", city: "San Francisco", country: "États-Unis" },
  { iata: "SEA", city: "Seattle", country: "États-Unis" },
  { iata: "LAS", city: "Las Vegas", country: "États-Unis" },
  { iata: "YUL", city: "Montréal", country: "Canada" },
  { iata: "YYZ", city: "Toronto", country: "Canada" },
  { iata: "YVR", city: "Vancouver", country: "Canada" },
  { iata: "MEX", city: "Mexico", country: "Mexique" },
  { iata: "CUN", city: "Cancún", country: "Mexique" },
  // Amérique latine
  { iata: "GRU", city: "São Paulo", country: "Brésil" },
  { iata: "GIG", city: "Rio de Janeiro", country: "Brésil" },
  { iata: "BSB", city: "Brasília", country: "Brésil" },
  { iata: "EZE", city: "Buenos Aires", country: "Argentine" },
  { iata: "SCL", city: "Santiago", country: "Chili" },
  { iata: "LIM", city: "Lima", country: "Pérou" },
  { iata: "BOG", city: "Bogota", country: "Colombie" },
  { iata: "UIO", city: "Quito", country: "Équateur" },
  { iata: "PTY", city: "Panama", country: "Panama" },
  { iata: "HAV", city: "La Havane", country: "Cuba" },
  // Moyen-Orient
  { iata: "DXB", city: "Dubaï", country: "Émirats arabes unis" },
  { iata: "AUH", city: "Abou Dabi", country: "Émirats arabes unis" },
  { iata: "DOH", city: "Doha", country: "Qatar" },
  { iata: "RUH", city: "Riyad", country: "Arabie saoudite" },
  { iata: "JED", city: "Djeddah", country: "Arabie saoudite" },
  { iata: "BAH", city: "Bahreïn", country: "Bahreïn" },
  { iata: "KWI", city: "Koweït", country: "Koweït" },
  { iata: "MCT", city: "Mascate", country: "Oman" },
  { iata: "AMM", city: "Amman", country: "Jordanie" },
  { iata: "BEY", city: "Beyrouth", country: "Liban" },
  { iata: "TLV", city: "Tel Aviv", country: "Israël" },
  // Afrique
  { iata: "CMN", city: "Casablanca", country: "Maroc" },
  { iata: "RAK", city: "Marrakech", country: "Maroc" },
  { iata: "TUN", city: "Tunis", country: "Tunisie" },
  { iata: "ALG", city: "Alger", country: "Algérie" },
  { iata: "CAI", city: "Le Caire", country: "Égypte" },
  { iata: "JNB", city: "Johannesbourg", country: "Afrique du Sud" },
  { iata: "CPT", city: "Le Cap", country: "Afrique du Sud" },
  { iata: "NBO", city: "Nairobi", country: "Kenya" },
  { iata: "ADD", city: "Addis-Abeba", country: "Éthiopie" },
  { iata: "DAR", city: "Dar es Salaam", country: "Tanzanie" },
  { iata: "ABJ", city: "Abidjan", country: "Côte d'Ivoire" },
  { iata: "DKR", city: "Dakar", country: "Sénégal" },
  { iata: "LOS", city: "Lagos", country: "Nigeria" },
  { iata: "ACC", city: "Accra", country: "Ghana" },
  { iata: "MRU", city: "Port-Louis", country: "Maurice" },
  { iata: "SEZ", city: "Mahé", country: "Seychelles" },
  // Asie
  { iata: "HND", city: "Tokyo Haneda", country: "Japon" },
  { iata: "NRT", city: "Tokyo Narita", country: "Japon" },
  { iata: "KIX", city: "Osaka", country: "Japon" },
  { iata: "NGO", city: "Nagoya", country: "Japon" },
  { iata: "ICN", city: "Séoul", country: "Corée du Sud" },
  { iata: "PEK", city: "Pékin", country: "Chine" },
  { iata: "PKX", city: "Pékin Daxing", country: "Chine" },
  { iata: "PVG", city: "Shanghai Pudong", country: "Chine" },
  { iata: "CAN", city: "Canton", country: "Chine" },
  { iata: "SZX", city: "Shenzhen", country: "Chine" },
  { iata: "CTU", city: "Chengdu", country: "Chine" },
  { iata: "HKG", city: "Hong Kong", country: "Hong Kong" },
  { iata: "TPE", city: "Taipei", country: "Taïwan" },
  { iata: "SIN", city: "Singapour", country: "Singapour" },
  { iata: "BKK", city: "Bangkok", country: "Thaïlande" },
  { iata: "HKT", city: "Phuket", country: "Thaïlande" },
  { iata: "KUL", city: "Kuala Lumpur", country: "Malaisie" },
  { iata: "CGK", city: "Jakarta", country: "Indonésie" },
  { iata: "DPS", city: "Bali Denpasar", country: "Indonésie" },
  { iata: "MNL", city: "Manille", country: "Philippines" },
  { iata: "SGN", city: "Hô Chi Minh-Ville", country: "Viêt Nam" },
  { iata: "HAN", city: "Hanoï", country: "Viêt Nam" },
  { iata: "DEL", city: "New Delhi", country: "Inde" },
  { iata: "BOM", city: "Mumbai", country: "Inde" },
  { iata: "BLR", city: "Bangalore", country: "Inde" },
  { iata: "MAA", city: "Chennai", country: "Inde" },
  { iata: "HYD", city: "Hyderabad", country: "Inde" },
  { iata: "CMB", city: "Colombo", country: "Sri Lanka" },
  { iata: "MLE", city: "Malé", country: "Maldives" },
  { iata: "KTM", city: "Katmandou", country: "Népal" },
  { iata: "DAC", city: "Dacca", country: "Bangladesh" },
  { iata: "ALA", city: "Almaty", country: "Kazakhstan" },
  // Océanie
  { iata: "SYD", city: "Sydney", country: "Australie" },
  { iata: "MEL", city: "Melbourne", country: "Australie" },
  { iata: "BNE", city: "Brisbane", country: "Australie" },
  { iata: "PER", city: "Perth", country: "Australie" },
  { iata: "AKL", city: "Auckland", country: "Nouvelle-Zélande" },
  { iata: "NAN", city: "Nadi", country: "Fidji" },
];

const AIRPORTS_BY_IATA: ReadonlyMap<string, Airport> = new Map(
  WORLD_AIRPORTS.map((a) => [a.iata.toUpperCase(), a]),
);

/** Fiche d'un aéroport (référentiel autocomplétion) par code IATA, ou `undefined`. */
export const findAirport = (iata: string): Airport | undefined =>
  AIRPORTS_BY_IATA.get(iata.toUpperCase());

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
