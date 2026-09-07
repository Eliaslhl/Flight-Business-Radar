# Recommandations & mode Radar (Phase 9)

> Cf. `PHASE-0-DISCOVERY.md` §9 (recommandations) et décision §7 (liste seed Radar).
> Tout est **pur** (`@fbr/analytics`) + **statique** (`@fbr/flight-domain`) : aucune I/O, aucune table.

## Vue d'ensemble

| Brique                      | Où                                                                     | Rôle                                                 |
| --------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| `computeOpportunityScore`   | `@fbr/analytics/recommendation.ts`                                     | Score 0-100 « bonne affaire, maintenant »            |
| `recommendDates`            | idem                                                                   | Top-N couples de dates les moins chers               |
| `rankRadarDestinations`     | idem                                                                   | Classement des destinations d'une recherche Radar    |
| `buildRecommendationReport` | idem                                                                   | Agrège les trois ci-dessus                           |
| `CDG_LONGHAUL_DESTINATIONS` | `@fbr/flight-domain/airports.ts`                                       | Liste seed (~53 aéroports) + `radarDestinationSlice` |
| Fan-out Radar               | `apps/worker/src/search-processor.ts`                                  | Sonde une tranche rotative de la liste seed          |
| API                         | `GET /api/searches/:id/recommendations`, `GET /api/radar/destinations` | Expose le rapport + la liste seed                    |
| Dashboard                   | carte « Recommandations » sur `/searches/[id]`                         | Bande d'opportunité + top dates + classement Radar   |

## Score d'opportunité

`computeOpportunityScore({ currentPriceEurCents, summary, trendDirection, daysUntilDeparture, targetEurCents?, maxEurCents?, sampleSize, minSampleSize? })`

- **Garde « données insuffisantes »** (Phase 0 §12) : `sampleSize < minSampleSize` (défaut 20, l'API passe `ANALYTICS_MIN_SAMPLE` = 30) ⇒ `{ score: null, band: "INSUFFICIENT_DATA" }`.
- Sinon `score` = somme de 4 facteurs, borné 0-100 :

  | Facteur      | Poids | Barème                                                                                |
  | ------------ | ----- | ------------------------------------------------------------------------------------- |
  | `pricePts`   | 0-60  | `≤ p10` → 60 · `≤ p25` → 46 · `≤ médiane` → 30 · `≤ p75` → 15 · `≤ p90` → 5 · sinon 0 |
  | `trendPts`   | 0-15  | `RISING` → 15 · `STABLE` → 8 · `FALLING` → 0                                          |
  | `urgencyPts` | 0-15  | `≤ 14 j` → 15 · `≤ 30 j` → 11 · `≤ 60 j` → 7 · `≤ 120 j` → 3 · sinon 0                |
  | `targetPts`  | 0-10  | `≤ cible` → 10 · sinon `≤ budget max` → 4 · sinon 0                                   |

- **Bandes** : `≥ 80` EXCEPTIONAL · `≥ 60` GOOD · `≥ 40` FAIR · sinon POOR.
- `reasons: string[]` — phrases FR expliquant chaque facteur qui contribue (jamais d'invention : uniquement des faits dérivés des observations).
- `factors` — le détail chiffré + `priceVsMedianPct`.

## Recommandation de dates

`recommendDates(observations, { top = 3, minSampleSize = 5 })` — regroupe les observations par `(outboundDate, returnDate)`, classe par **dernier prix observé** (départage : prix minimum). Chaque entrée : `latestPriceEurCents`, `minPriceEurCents`, `sampleSize`, `reliable`, `deltaVsMedianPct` (écart à la médiane globale de la recherche). Un couple sous-échantillonné reste listé, `reliable: false`.

## Mode Radar (recherche sans destination)

Une recherche dont `destinations` est **vide** est en mode Radar.

### Liste seed — `@fbr/flight-domain/airports.ts`

`CDG_LONGHAUL_DESTINATIONS` : ~53 aéroports intercontinentaux desservis en Business au départ de CDG (`{ iata, city, country, region }`), regroupés par région (Asie, Amérique du Nord/Sud, Moyen-Orient, Afrique, Océanie, Océan Indien). Données **statiques éditables** — point de départ, pas un référentiel exhaustif (résout la décision Phase 0 §7 sans introduire de table `airports`).

`radarDestinationSlice(offset, count)` renvoie une tranche rotative : sur plusieurs runs, `offset` fait défiler la liste et toutes les destinations finissent couvertes.

### Fan-out worker (`search-processor.ts`)

Pour une recherche Radar, `processSearchRun` :

1. ne garde **qu'un** couple de dates (le plus prioritaire) — pas d'explosion dates × destinations ;
2. remplace ses destinations par `radarDestinationSlice(⌊runAt / 10 min⌋, RADAR_BATCH_SIZE)` (défaut 8) via `buildRequestForCombination(search, combo, { destinations })` ;
3. le reste du pipeline est inchangé : normalizer → `price_snapshots` → `price_events` → alertes.

`markCombinationsChecked` porte toujours sur toutes les combinaisons sélectionnées, donc l'ordonnancement adaptatif avance normalement.

### Classement

`rankRadarDestinations(observations, { minSampleSize = 3, top? })` — regroupe par `destination`, classe par dernier prix (départage : prix minimum). Chaque entrée : `latestPriceEurCents`, `minPriceEurCents`, `bestOutboundDate`, `sampleSize`, `reliable`.

`buildRecommendationReport` inclut la section `radar` dès que les observations couvrent **plusieurs** destinations (ou si `options.radar` est forcé — l'API le fait pour toute recherche Radar).

## API

| Route                                   | Réponse                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /api/searches/:id/recommendations` | `{ currency, generatedAt, sampleSize, opportunity, dates[], radar[] \| null }` · `404` si inconnue |
| `GET /api/radar/destinations`           | `{ origin: "CDG", count, destinations: SeedAirport[] }` — statique, aucun secret                   |

## Config

| Variable           | Défaut | Rôle                                                    |
| ------------------ | ------ | ------------------------------------------------------- |
| `RADAR_BATCH_SIZE` | 8      | Destinations seed sondées par run d'une recherche Radar |
