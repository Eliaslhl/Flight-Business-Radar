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

| Provider                | Statut         | Notes                                                                                                                            |
| ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `MockFlightProvider`    | ✅ Phase 2     | Provider de test déterministe. Aucune I/O.                                                                                       |
| `FixtureFlightProvider` | ✅ Phase 7     | Rejoue des `FlightOffer` canoniques (tests, CI, démo hors-ligne). Aucune I/O.                                                    |
| `FastFlightsProvider`   | ✅ Phase 7     | Client HTTP du sidecar `services/flight-scraper` (Google Flights via `fast-flights`). Actif quand `FAST_FLIGHTS_URL` est défini. |
| SerpApi Google Flights  | ⏳ (au besoin) | Provider réel payant. Documenté §43 ; à brancher ici sans toucher au pipeline.                                                   |
| Duffel                  | ⏳ (au besoin) | Oracle de confirmation des flash drops + lien de réservation.                                                                    |

## `FastFlightsProvider` + sidecar `services/flight-scraper` (Phase 7)

Choix Phase 7 : **surveillance réelle, gratuite, 100 % locale**. Le scraper Google Flights
(`fast-flights`, OSS) est isolé dans un **sidecar Python** (FastAPI) — application du principe
Phase 0 §43 : « un scraper fragile est isolé derrière une interface, toujours avec un
fallback, et le produit ne dépend jamais entièrement de lui ».

### Contrat HTTP

`POST /search` (JSON) → `SearchResponse` :

```jsonc
{
  "provider": "fast-flights",
  "mode": "fixture" | "live",
  "degraded": false,           // true => aucune offre exploitable, voir "error"
  "currency": "EUR",
  "fetchedAt": "2026-09-06T17:57:27Z",
  "offers": [ /* Offer[] : priceCents, outbound/inbound Leg, totalStops, isBest, bookingUrl */ ],
  "error": null                // string quand degraded
}
```

Le sidecar renvoie **toujours HTTP 200**, même en échec (`degraded: true, offers: []`).
`GET /health` → `{ "status": "ok", "mode": ... }`.

### Modes

| Mode      | Défaut | Comportement                                                                                                                                                                                                                                                                                                        |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixture` | ✅     | Sert `services/flight-scraper/fixtures/<ORIGIN>-<DEST>.json` (ou `default.json`), dates recalées sur la requête, jitter déterministe par tranche de 10 min. **Toujours fonctionnel** — c'est le chemin fiable.                                                                                                      |
| `live`    |        | Best-effort : appelle `fast_flights.get_flights(...)`. **Aujourd'hui non fonctionnel** (voir Risque ci-dessous) → renvoie `degraded: true, offers: []`. À réactiver sans changement de code le jour où l'upstream refonctionne, ou en pointant `FAST_FLIGHTS_URL` vers un autre backend respectant le même contrat. |

Sélection : variable d'environnement `FLIGHT_SCRAPER_MODE` du sidecar (défaut `fixture`).

### Risque connu (`live`)

`fast-flights` en fetch direct/gratuit est **cassé** à ce jour : Google ne renvoie plus le
blob `<script>` attendu → `AttributeError: 'NoneType' object has no attribute 'text'` dans
`parser.parse`. Les chemins qui marchent exigent une intégration payante (BrightData /
SearchApi). Le sidecar dégrade proprement ; le produit continue de tourner sur `fixture` et
sur les autres providers du `ProviderRegistry`.

### Côté Node — `FastFlightsProvider`

`packages/flight-providers/src/fast-flights-provider.ts` :

- lit `FAST_FLIGHTS_URL` / `FAST_FLIGHTS_TIMEOUT_MS` (via `@fbr/config`) ; sans URL, le worker
  reste sur `MockFlightProvider`.
- valide la réponse du sidecar avec un schéma Zod (`scraper-contract.ts`) — payload invalide
  ⇒ `ProviderError` non-retryable.
- `degraded: true` ⇒ `[]` (aucune erreur levée, l'`outcome` reste `ok`).
- HTTP 5xx ⇒ `ProviderError` retryable ; timeout / erreur réseau ⇒ `PROVIDER_TIMEOUT` retryable.
- synthétise les horaires manquants (`durationMinutes` défaut 600) et résout le code IATA
  compagnie depuis le nom via `airline-codes.ts` (~55 alias, fallback `XX`).
- recherche **Radar** (sans destination) non supportée ⇒ `ProviderError` non-retryable.

### Lancer le sidecar

```bash
# Docker (profil dédié, ne démarre pas avec le stack par défaut)
docker compose --profile scraper up -d flight-scraper      # http://localhost:8000

# ou en local
cd services/flight-scraper && python3 -m venv .venv \
  && .venv/bin/pip install -r requirements.txt \
  && FLIGHT_SCRAPER_MODE=fixture .venv/bin/uvicorn main:app --port 8000
```

Puis dans `.env` : `FAST_FLIGHTS_URL=http://localhost:8000`.

### Observabilité — `provider_requests`

Chaque appel provider (succès **ou** échec) est journalisé en base par le worker :
table `provider_requests` (`provider, search_id, ok, offer_count, latency_ms, error_code,
error_message, created_at`). Exposé via `GET /api/searches/:id/provider-requests`.

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
