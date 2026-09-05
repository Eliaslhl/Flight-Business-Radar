# Flight providers

> Comparatif complet et fiches détaillées : [`PHASE-0-DISCOVERY.md`](PHASE-0-DISCOVERY.md) §2 et §43.
> Ce document décrit le **contrat** et l'état d'implémentation.

## Contrat (`@fbr/flight-providers`)

```ts
interface FlightProvider {
  readonly name: string;
  searchFlights(request: FlightSearchRequest): Promise<FlightOffer[]>;
}
```

Règles :

- Le provider **convertit lui-même** sa réponse brute vers `FlightOffer` (modèle interne unique — Phase 0 §27). Le reste de l'app ne connaît jamais l'API d'un fournisseur.
- Un `searchFlights` porte **un seul** couple de dates (celui de la requête). La génération des combinaisons de dates est faite par le moteur de recherche (Phase 3).
- En cas d'échec technique : **rejeter** avec une `ProviderError` (`@fbr/shared`) — jamais renvoyer un tableau d'offres invalides.
- `name` court et stable (`"mock"`, `"serpapi"`, `"duffel"`).

## `ProviderRegistry`

Exécute N providers **en parallèle** et **isole les échecs** (Phase 0 §25) : `searchAll(request)` ne rejette jamais.

```ts
const registry = new ProviderRegistry([providerA, providerB], { logger });
const { offers, outcomes } = await registry.searchAll(request);
// offers   : FlightOffer[] concaténées des providers en succès (non dédupliquées)
// outcomes : { provider, ok, offerCount, latencyMs, error? }[]
```

La déduplication inter-providers est faite ensuite par `@fbr/normalizer`.

## Providers implémentés

| Provider               | Statut     | Notes                                                         |
| ---------------------- | ---------- | ------------------------------------------------------------- |
| `MockFlightProvider`   | ✅ Phase 2 | Provider de test déterministe. Aucune I/O.                    |
| SerpApi Google Flights | ⏳ Phase 7 | 1er provider réel (documenté, Business, `travel_class=3`).    |
| Duffel                 | ⏳ Phase 7 | Oracle de confirmation des flash drops + lien de réservation. |

## `MockFlightProvider` — scénarios

| Scénario       | Comportement                                                         |
| -------------- | -------------------------------------------------------------------- |
| `normal`       | Prix stable ± bruit déterministe (~1 %), PRNG mulberry32 semé.       |
| `gradual-drop` | Baisse de ~4 % par appel, plancher à 50 % du prix de base.           |
| `flash-drop`   | Ratios `1 → 0.95 → 0.84 → 0.63 → 1` puis stable (cf. Phase 0 §34).   |
| `record-low`   | Nouveau plus-bas à chaque appel (0.70 → 0.35 × base).                |
| `unavailable`  | Offre renvoyée mais `availability = WAITLIST`, `seatsRemaining = 0`. |
| `error`        | Lève une `ProviderError` (`PROVIDER_ERROR`, retryable).              |
| `timeout`      | Lève une `ProviderError` (`PROVIDER_TIMEOUT`, retryable).            |

Options : `scenario`, `name`, `seed`, `basePriceEur`, `marketingAirline`, `flightNumber`, `latencyMs`, `radarFallbackDestination`, `now` (horloge injectable).
Le compteur `callCount` fait avancer les scénarios dynamiques ; `reset()` le remet à zéro.

## Normalisation & data quality (`@fbr/normalizer`)

`normalizeSearchResults(request, offers, options)` → `{ offers, rejected, duplicates, stats }`.

Motifs de rejet (`validateOffer`) : `MALFORMED`, `PRICE_MISSING`, `PRICE_IMPLAUSIBLE`, `CURRENCY_UNKNOWN`, `CURRENCY_MISMATCH`, `CABIN_MISMATCH`, `ROUTE_MISMATCH`, `DATE_INCOHERENT`, `STOPS_EXCEEDED`, `AIRLINE_EXCLUDED`.

- La **bande de plausibilité** (défaut 400 € – 30 000 €) ne s'applique qu'à la devise de référence ; la conversion multidevise arrive en Phase 4.
- Déduplication par `fingerprint` : on garde l'offre la moins chère (tie-break : provider préféré → disponibilité → observation la plus récente → nom).
