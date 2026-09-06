# Analytics & détection de baisses

> Cf. `PHASE-0-DISCOVERY.md` §9 (flash drops), §11 (historique), §12 (périodes), §37 (analytics engine).
> Devise unique : **EUR** (`price_eur_cents`, normalisé par `@fbr/fx`).

## `@fbr/analytics` (pur, sans I/O)

### Statistiques descriptives — `summarize(values)`

`{ count, min, max, mean, median, p10, p25, p75, p90, stdDev, coefficientOfVariation }`
(`coefficientOfVariation` = volatilité relative = écart-type / moyenne). `null` si série vide.
`percentile(sorted, p)` interpole linéairement.

### Tendance — `computePriceTrend(points)`

Régression linéaire des moindres carrés sur (jours, prix) :
`{ slopePerDay, direction: RISING|FALLING|STABLE, changePct, points, r2 }`. `null` si < 2 points ou instants identiques. `STABLE` quand |pente| ≤ 0,2 %/jour de la moyenne.

### Statistiques groupées

`monthlyStats` (`YYYY-MM` du départ), `dayOfWeekStats` (0–6), `tripDurationStats`, `airlineStats`, `stopsStats`.
Chaque groupe : `{ key, summary, reliable }`. **`reliable = false`** en dessous de `minSampleSize` (défaut 20) — on ne présente jamais une stat comme fiable sur trop peu de données (Phase 0 §12).

### Rapport complet — `buildAnalyticsReport(observations, options)`

`{ currency: "EUR", sampleSize, reliable, summary, trend, best, latest, byMonth, byDayOfWeek, byTripDuration, byAirline, byStops, bestMonth }`.
`bestMonth` privilégie les groupes fiables ; `reliable` global sous `overallMinSampleSize` (défaut 30).

### Dérivation d'événements — `derivePriceEvents(ctx, thresholds)`

Compare le snapshot courant au précédent + à l'historique agrégé (`minEver`, `maxEver`, `p10`, `target`), applique des **filtres anti-faux-positifs** (bande de plausibilité — un prix corrompu ne produit **aucun** événement), et renvoie les types déclenchés :

| Type                         | Condition (seuils configurables)                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `FLASH_DROP`                 | baisse ≥ `flashDropPct` (12 %) **ET** ≥ `flashDropAbsCents` (120 €) **ET** ≤ `flashWindowMinutes` (90) |
| `DROP`                       | baisse ≥ `priceDropPct` (5 %)                                                                          |
| `RISE`                       | hausse ≥ `risePct` (5 %)                                                                               |
| `RECORD_LOW` / `RECORD_HIGH` | prix sous / au-dessus de tout l'historique de l'offre                                                  |
| `TARGET_HIT`                 | prix ≤ prix cible de la recherche                                                                      |
| `UNUSUAL`                    | prix < p10 **ET** ≥ `unusualMinSample` (30) observations                                               |

`analyzeDrop(prev, curr)` → `{ dropAmountEurCents, dropPct, minutesBetween }` (positif = baisse).

> La **confirmation** (2ᵉ requête) et les **notifications + cooldown** sont en Phase 5. La Phase 4 se contente de détecter, persister et **résoudre** (clôturer une baisse dont le prix est revenu).

## `@fbr/fx` — normalisation des devises (Phase 0 §28)

| Élément                                  | Rôle                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `FxProvider`                             | `fetchRates(base) → { <quote>: rate }` (1 base = rate quote)                   |
| `FixedFxProvider`                        | taux fixes de la config (`FX_SOURCE=fixed`, `FX_FIXED_RATES` JSON)             |
| `FrankfurterFxProvider`                  | [frankfurter.dev](https://frankfurter.dev) — API publique, taux BCE, sans clé  |
| `RateStore`                              | cache (impl. DB : table `fx_rates`)                                            |
| `FxService.toBaseCents(cents, currency)` | conversion vers `BASE_CURRENCY` (centimes, arrondi) ; identité si déjà en base |

Le service ne récupère que des taux `base → X` et dérive les autres sens par produit croisé. Chaque taux récupéré est mis en cache (`fx_rates`, clé `base+quote+jour`).

## Chaîne d'exécution

Worker `processSearchRun` → écrit les `price_snapshots` (avec `price_eur_cents` via `FxService`) → passe **`analyzeOffers`** : pour chaque offre touchée, `getRecentSnapshotsForOffer` + `getOfferPriceAggregate` (historique **avant** le snapshot courant) → `derivePriceEvents` → `insertPriceEvents` + résolution des baisses ouvertes revenues.

## API

- `GET /api/searches/:id/analytics` → `buildAnalyticsReport` sur toutes les observations `price_eur_cents` de la recherche.
- `GET /api/searches/:id/events?limit=200` → `price_events` (le plus récent d'abord).

## Configuration (`.env`)

| Variable               | Défaut      | Rôle                                            |
| ---------------------- | ----------- | ----------------------------------------------- |
| `FX_SOURCE`            | frankfurter | `frankfurter` \| `fixed`                        |
| `FX_FIXED_RATES`       | —           | JSON `{ "USD": 1.08, … }` si `fixed`            |
| `DROP_PCT`             | 0.05        | seuil `DROP`                                    |
| `FLASH_DROP_PCT`       | 0.12        | seuil relatif `FLASH_DROP`                      |
| `FLASH_DROP_ABS_EUR`   | 120         | seuil absolu `FLASH_DROP` (€)                   |
| `FLASH_WINDOW_MINUTES` | 90          | fenêtre « flash »                               |
| `ANALYTICS_MIN_SAMPLE` | 30          | échantillon min (`UNUSUAL` + fiabilité globale) |
