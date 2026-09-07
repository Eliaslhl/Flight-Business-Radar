# Architecture

> Vue de référence. La cible complète et sa justification sont dans [`PHASE-0-DISCOVERY.md`](PHASE-0-DISCOVERY.md) §4. Ce document décrit l'état **réellement implémenté** + les conventions.

## Principes

- **Monorepo** pnpm workspaces + Turborepo. Un package = une responsabilité.
- **TypeScript strict** partout (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, …).
- **DDD léger** : la logique métier vit dans des packages purs (`core-domain`, `analytics`, `alerting`) sans I/O. Les apps (`api`, `worker`) orchestrent ; les controllers restent fins.
- **Providers derrière une interface** : aucune partie du système ne dépend d'une API fournisseur concrète.
- **Historique append-only** : `price_snapshots` n'est jamais écrasé.
- **Config centralisée** : pas de `process.env` hors de `@fbr/config`.
- **Logs structurés** : toujours via `@fbr/shared` `createLogger`, avec un `event` nommé (`LogEvent`).

## Packages (état Phase 10)

| Package                 | Rôle                                                                                                                                                                                                                                   | Dépend de                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `@fbr/shared`           | logger pino (redaction secrets), `AppError` (+ `retryable`), `Result`, helpers monétaires (centimes entiers), `LogEvent`                                                                                                               | —                                          |
| `@fbr/config`           | schéma Zod de l'environnement, `loadConfig()` fail-fast, singleton `getConfig()`                                                                                                                                                       | `@fbr/shared`                              |
| `@fbr/flight-domain`    | modèle métier pur : `FlightSearchRequest`, `FlightOffer` (+ schémas Zod), value objects IATA/dates/devise/cabine, `computeFingerprint`, **liste seed CDG long-courrier** (`CDG_LONGHAUL_DESTINATIONS`, `radarDestinationSlice`)        | `@fbr/shared`                              |
| `@fbr/flight-providers` | interface `FlightProvider`, `ProviderRegistry` (exécution parallèle isolée), `MockFlightProvider` (7 scénarios), `FixtureFlightProvider`, `FastFlightsProvider` (client HTTP du sidecar) + contrat Zod + résolution codes IATA         | `@fbr/flight-domain`, `@fbr/shared`, `zod` |
| `@fbr/normalizer`       | contrôle qualité (`validateOffer`), déduplication (`dedupeOffers`), orchestration (`normalizeSearchResults`)                                                                                                                           | `@fbr/flight-domain`, `@fbr/shared`        |
| `@fbr/search-engine`    | pur : `generateDateCombinations` (anti-explosion), `computeSearchPriority`, `computeNextIntervalSeconds` (surveillance adaptative), mappers                                                                                            | `@fbr/flight-domain`, `@fbr/shared`        |
| `@fbr/analytics`        | pur : stats descriptives / groupées, tendance, `derivePriceEvents`, `buildAnalyticsReport`, **`computeOpportunityScore` / `recommendDates` / `rankRadarDestinations` / `buildRecommendationReport`** (garde « données insuffisantes ») | `@fbr/shared`                              |
| `@fbr/advisor`          | pur : `buildAdvisorInput`, `summarizeAdvice` (règles), `assertGrounded` (garde-fou anti-invention), `generateAdvice` ; `MockLlmClient` (défaut) + `AnthropicLlmClient` (fetch brut, si clé)                                            | `@fbr/analytics`, `@fbr/shared`            |
| `@fbr/fx`               | pur : `FxProvider` (fixed / Frankfurter), `FxService` sur `RateStore` — normalisation en EUR                                                                                                                                           | `@fbr/shared`                              |
| `@fbr/alerting`         | pur : `matchAlerts`, `isInCooldown`, `needsConfirmation` / `isPriceConfirmed`, `buildAlertNotification`                                                                                                                                | `@fbr/analytics`, `@fbr/shared`            |
| `@fbr/notifications`    | `NotificationChannel` + `NotificationService.dispatch` (multi-canal isolé, `Promise.allSettled`) ; canaux `Console` / `Telegram` / `Email` (SMTP) / `Webhook` + `withRetry` (backoff, timeout)                                         | `@fbr/shared`, `nodemailer`                |
| `@fbr/queue`            | BullMQ + Redis : connexion, file `search`, `createSearchWorker`, `enqueueSearchRun`                                                                                                                                                    | `@fbr/shared` (+ `bullmq`, `ioredis`)      |
| `@fbr/database`         | schéma Drizzle (12 tables), client `postgres.js`, `runMigrations`, repositories typés (searches / offers / snapshots / events / fx / alerts / notifications / provider-requests)                                                       | `@fbr/shared`, `@fbr/config` (dev)         |

### Services

| Service                   | Langage          | Rôle                                                                                                                                                                                                                                                 |
| ------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/flight-scraper` | Python (FastAPI) | Sidecar isolant le scraper Google Flights `fast-flights` (Phase 0 §43). Modes `fixture` (défaut, fiable) / `live` (best-effort). Contrat HTTP `POST /search`. Consommé par `FastFlightsProvider`. Voir [`FLIGHT_PROVIDERS.md`](FLIGHT_PROVIDERS.md). |

### Apps (état Phase 10)

| App           | Rôle              | Détail                                                                                                                                                                                                                                                                                                                          |
| ------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fbr/api`    | API HTTP Fastify  | `/health` + `/api/searches` (CRUD, run, flights, prices, analytics, recommendations, **advice**, events, notifications, provider-requests) + `/api/alerts` (CRUD) + `/api/notifications/channels` + `/api/radar/destinations`. Controllers fins.                                                                                |
| `@fbr/worker` | Process de fond   | Scheduler + worker BullMQ : providers (`FastFlightsProvider` si `FAST_FLIGHTS_URL`, sinon `MockFlightProvider` ; **mode Radar → fan-out sur une tranche rotative de la liste seed**) → journal `provider_requests` → normalizer → `price_snapshots` (append-only, FX) → `analyzeOffers` → `runAlertPipeline` → replanification. |
| `@fbr/web`    | Dashboard Next.js | App Router + TanStack Query + Recharts. **Découplé par HTTP** (aucun import `@fbr/*`) ; `next.config` proxie `/api/*` → API (pas de CORS). Pages : dashboard, recherches, détail (graphiques), alertes, réglages.                                                                                                               |

## Résolution des packages

Chaque `package.json` expose une condition `development` pointant vers `src/index.ts` :

```jsonc
"exports": { ".": { "development": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" } }
```

- `customConditions: ["development"]` (base tsconfig) fait résoudre `@fbr/*` vers `src/` pour **tsc** et **typescript-eslint** → pas besoin de builder avant de typechecker/tester.
- **Vitest** ajoute la même condition `development` (voir `vitest.workspace.ts`).
- **Production / `node dist`** : Node ignore la condition `development` → `default` → `dist/*.js` (build `tsc -p tsconfig.build.json` par package, ordonné par Turborepo via `^build`).
- Chaque package a deux tsconfig : `tsconfig.json` (lint/typecheck, inclut les tests) et `tsconfig.build.json` (émission, exclut les tests).

## Flux cible (rappel)

```
Scheduler → queue:search → ProviderRegistry (Promise.allSettled)
  → Normalizer (valider, dédupliquer, upsert flight_offers)
  → price_snapshots (append only)
  → queue:analyze → détection price_events
  → queue:confirm → re-requête même + autre provider
  → Alerting (règles + cooldown) → queue:notify → NotificationService → canaux
```

## Conventions de code

- Modules ESM, imports relatifs avec extension `.js` (NodeNext).
- `type`-only imports explicites (`import { type X }` / `import type`).
- Fonctions courtes, responsabilité unique, pas de duplication.
- Toute erreur attendue passe par `AppError` (code stable + `retryable`).
- Tests co-localisés : `*.test.ts` à côté du fichier.
