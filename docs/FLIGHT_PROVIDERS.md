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

| Provider                | Statut     | Notes                                                                                                                                                              |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MockFlightProvider`    | ✅ Phase 2 | Provider de test déterministe. Aucune I/O.                                                                                                                         |
| `FixtureFlightProvider` | ✅ Phase 7 | Rejoue des `FlightOffer` canoniques (tests, CI, démo hors-ligne). Aucune I/O.                                                                                      |
| `FastFlightsProvider`   | ✅ Phase 7 | Client HTTP du sidecar `services/flight-scraper` (Google Flights via `fast-flights`). Actif quand `FAST_FLIGHTS_URL` est défini.                                   |
| `TravelpayoutsProvider` | ✅         | **Réel, gratuit, mais EN CACHE** (~48 h, économie surtout). Actif quand `TRAVELPAYOUTS_TOKEN` est défini. Radar de tendance / meilleur moment.                     |
| `SerpApiFlightProvider` | ✅         | **Provider réel payant** (SerpApi Google Flights). Actif quand `SERPAPI_API_KEY` est défini. 1 recherche = 1 crédit SerpApi.                                       |
| `DuffelFlightProvider`  | ✅         | **Payant — oracle de confirmation** (contenu réservable NDC/GDS). Actif quand `DUFFEL_API_TOKEN` est défini. Hors `ProviderRegistry` : branché sur le `confirmer`. |

### Composition (`apps/worker/src/providers.ts`)

`buildProviderRegistry` compose la liste de **recherche** par présence de config (Phase 0
§5 — jamais de dépendance à un seul fournisseur) :

| Config présente       | Providers de recherche actifs              |
| --------------------- | ------------------------------------------ |
| `SERPAPI_API_KEY`     | `serpapi`                                  |
| `TRAVELPAYOUTS_TOKEN` | `travelpayouts`                            |
| `FAST_FLIGHTS_URL`    | `fast-flights`                             |
| plusieurs             | tous en parallèle, dédup par le normalizer |
| aucun                 | `mock`                                     |

`buildConfirmationOracle` renvoie en plus un `DuffelFlightProvider` (ou `null`) — utilisé
**uniquement** par le `confirmer` du pipeline d'alerte, pas dans la recherche.

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

## `TravelpayoutsProvider` — Travelpayouts Data API (gratuit, données en cache)

**La seule source réelle gratuite et immédiatement accessible.** Travelpayouts a deux API :
la _Flights Search_ (cotations live) exige une candidature + 50 000 MAU ; la **_Data API_**
donne un token **gratuit et instantané** après inscription affilié — mais renvoie des **prix
en cache** issus des vraies recherches des utilisateurs Aviasales.

### Nature des données — à assumer

- **Fraîcheur ~48 h** (endpoint `/v2/prices/latest`). Chaque ligne porte `found_at` = quand
  le prix a réellement été trouvé → c'est lui qui sert d'`observedAt`, **pas** l'heure du
  sondage. L'historique reflète donc la réalité, pas un artefact de polling.
- **Économie surtout.** Le param `trip_class` existe (`0` éco / `1` business / `2` first)
  mais le business est très peu représenté dans le cache Aviasales.
- **Pas de flash drops.** Une baisse de quelques minutes est invisible dans une donnée en
  cache. L'alerte `FLASH_DROP` reste dans le code mais ne se déclenchera quasiment jamais
  avec cette source. Tout le reste tient : tendance, meilleur mois/dates, score
  d'opportunité, recommandations, advisor, alertes `TARGET_PRICE` / `PRICE_DROP` (graduelles)
  / `RECORD_LOW`.

### Requête

`GET https://api.travelpayouts.com/v2/prices/latest` avec `token`, `currency=eur`, `origin`,
`destination`, `period_type=month`, `beginning_of_period=<YYYY-MM-01>`, `one_way=false`,
`trip_class`, `sorting=price`, `show_to_affiliates=true`. La réponse couvre le mois entier ;
le provider **filtre** sur le couple `(depart_date, return_date)` exact de la combinaison et
sur `trip_class`.

### Conversion & robustesse

- 1 appel = 1 couple de dates × 1 destination. `value` (unités entières) → centimes.
  Horaires non fournis par cet endpoint → synthétisés ; `number_of_changes` → escales.
  `airline` absent → code `XX` (l'empreinte retombe alors sur route + dates + escales, ce
  qui est le bon grain pour un suivi de « le vol le moins cher »).
- `HTTP 401` / `429` → `ProviderError` **non-retryable** ; `5xx` → retryable ;
  `{ success: false }` → non-retryable ; aucune ligne pour le couple → `[]`.
- **Anti-doublon** : `dedupeAgainstExistingSnapshots` (dans le worker) écarte les lignes
  déjà en base au même `(flight_offer_id, observed_at)` — sinon chaque sondage ré-insère les
  mêmes lignes de cache.
- **Cadence** : si Travelpayouts est la **seule** source réelle, le worker relève le
  plancher d'intervalle à **3 h** (`cached_source_interval_floor`) — sonder plus vite ne
  rapporte rien et grille le quota (~200 req/h).
- `marker` (affilié) fourni → génère un lien de réservation Aviasales (`bookingUrl`).

### Config (`.env`)

| Variable                         | Défaut   | Rôle                                                                 |
| -------------------------------- | -------- | -------------------------------------------------------------------- |
| `TRAVELPAYOUTS_TOKEN`            | _(vide)_ | Active le provider. Token gratuit (inscription affilié). **Secret.** |
| `TRAVELPAYOUTS_MARKER`           | _(vide)_ | Marqueur affilié — active les liens de réservation Aviasales         |
| `TRAVELPAYOUTS_TIMEOUT_MS`       | 20000    | Timeout par appel                                                    |
| `TRAVELPAYOUTS_MAX_DESTINATIONS` | 8        | Plafond de destinations par run (mode Radar)                         |

## `SerpApiFlightProvider` — SerpApi Google Flights (payant)

1er provider **réel payant** (Phase 0 §2 — meilleur compromis documenté / couverture
juridique / Business Class). `engine=google_flights`, `travel_class=3`.

### Coût & garde-fous

- **1 appel HTTP = 1 crédit SerpApi.** Un run de recherche « normale » = 1 crédit
  (1 destination). Un run **mode Radar** = `RADAR_BATCH_SIZE` crédits (une destination
  de la tranche seed par crédit).
- Plafond `SERPAPI_MAX_DESTINATIONS` (défaut 8) : le provider tronque au-delà et loggue
  un `debug` — protège d'un dépassement de quota accidentel.
- `HTTP 429` (quota) et `HTTP 401` (clé) → `ProviderError` **non-retryable** (réessayer
  tout de suite est inutile). `HTTP 5xx` → retryable. Timeout / réseau → `PROVIDER_TIMEOUT`.
- Surveiller la consommation via `provider_requests` (`provider = "serpapi"`,
  `latency_ms`, `ok`).
- La cadence est déjà bornée par la surveillance adaptative
  (`computeNextIntervalSeconds` + `PROVIDER_MIN_INTERVAL_SECONDS`).

### Conversion

- `best_flights` + `other_flights` → une `FlightOffer` par option ; option **sans `price`**
  ignorée. `price` (unités entières de la devise) → `price.amount` en centimes.
- Trajet **aller** détaillé depuis `option.flights` (horaires locaux `YYYY-MM-DD HH:MM`
  sérialisés `…T…:…:00Z` nominal, comme le sidecar) ; `flight_number` « AF 276 » → `AF276` ;
  nom de compagnie → code IATA via `airline-codes`.
- Trajet **retour** : le 1er appel SerpApi (round trip) ne renvoie que l'aller ; l'inbound
  est **synthétisé** de façon déterministe (mêmes dates de requête, même compagnie) —
  empreinte stable, historique de prix cohérent. Le **prix total**, lui, est réel.
  `option.departure_token` est conservé dans `raw` pour un éventuel 2ᵉ appel (détails retour).

### Config (`.env`)

| Variable                   | Défaut   | Rôle                                                           |
| -------------------------- | -------- | -------------------------------------------------------------- |
| `SERPAPI_API_KEY`          | _(vide)_ | Active le provider. **Secret — jamais committé.**              |
| `SERPAPI_TIMEOUT_MS`       | 20000    | Timeout par appel                                              |
| `SERPAPI_MAX_DESTINATIONS` | 8        | Plafond de destinations interrogées par run (garde-fou budget) |

## `DuffelFlightProvider` — oracle de confirmation (payant)

Duffel (API v2) fournit du contenu **NDC/GDS réellement réservable**. Rôle retenu
(Phase 0 §2 / §10) : **oracle de confirmation** des baisses exceptionnelles, indépendant du
provider de recherche.

### Rôle dans le pipeline

Le confirmer (`apps/worker/src/confirmer.ts`) devient `buildConfirmer(registry, fx, { oracle })` :

```
needsConfirmation(alertType)   // FLASH_DROP / RECORD_LOW / UNUSUAL_PRICE
  └─ oracle Duffel présent ?
       ├─ oui → interroge Duffel (contenu réservable) → rechecks avec availability=AVAILABLE
       │         └─ échec Duffel (401/429/5xx/timeout) → log confirm_oracle_failed
       │                                                 → repli sur les providers de recherche
       └─ non → re-requête les providers de recherche (comportement Phase 5)
```

Sans oracle, `isPriceConfirmed` exige `availability ∈ {AVAILABLE, LOW}` — que les providers
de scraping/SerpApi ne fournissent pas (`UNKNOWN`). Duffel lève cette limite : une offre
Duffel = du réservable, donc `AVAILABLE`.

### Requête

`POST /air/offer_requests?return_offers=true` (en-tête `Duffel-Version: v2`,
`Authorization: Bearer <token>`) — 2 slices (aller + retour), `cabin_class: business`,
`max_connections` mappé depuis `maxStops`. **Un `offer_request` = une facturation Duffel.**

### Conversion & robustesse

- `data.offers[]` → `FlightOffer` : `total_amount` (chaîne décimale) → centimes ; aller **et
  retour** détaillés (Duffel renvoie les 2 slices) ; `duration` ISO 8601 (`PT13H40M`) →
  minutes ; `marketing_carrier.iata_code` + `marketing_carrier_flight_number` → `AF276` ;
  horaires locaux → ISO nominal (`…Z`).
- `401` / `429` → `ProviderError` **non-retryable** ; `5xx` → retryable ; timeout / réseau
  → `PROVIDER_TIMEOUT` ; aucune offre → `[]`.
- Sandbox (`duffel_test_…`) : offres factices « Duffel Airways ». Live (`duffel_live_…`) :
  contenu réel, compte vérifié requis.

### Config (`.env`)

| Variable                  | Défaut   | Rôle                                               |
| ------------------------- | -------- | -------------------------------------------------- |
| `DUFFEL_API_TOKEN`        | _(vide)_ | Active l'oracle. **Secret — jamais committé.**     |
| `DUFFEL_TIMEOUT_MS`       | 20000    | Timeout par `offer_request`                        |
| `DUFFEL_MAX_DESTINATIONS` | 4        | Plafond de destinations par appel (garde-fou coût) |

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
