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

## Packages (état Phase 4)

| Package                 | Rôle                                                                                                                                              | Dépend de                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `@fbr/shared`           | logger pino (redaction secrets), `AppError` (+ `retryable`), `Result`, helpers monétaires (centimes entiers), `LogEvent`                          | —                                     |
| `@fbr/config`           | schéma Zod de l'environnement, `loadConfig()` fail-fast, singleton `getConfig()`                                                                  | `@fbr/shared`                         |
| `@fbr/flight-domain`    | modèle métier pur : `FlightSearchRequest`, `FlightOffer` (+ schémas Zod), value objects IATA/dates/devise/cabine, `computeFingerprint`            | `@fbr/shared`                         |
| `@fbr/flight-providers` | interface `FlightProvider`, `ProviderRegistry` (exécution parallèle isolée), `MockFlightProvider` (7 scénarios)                                   | `@fbr/flight-domain`, `@fbr/shared`   |
| `@fbr/normalizer`       | contrôle qualité (`validateOffer`), déduplication (`dedupeOffers`), orchestration (`normalizeSearchResults`)                                      | `@fbr/flight-domain`, `@fbr/shared`   |
| `@fbr/search-engine`    | pur : `generateDateCombinations` (anti-explosion), `computeSearchPriority`, `computeNextIntervalSeconds` (surveillance adaptative), mappers       | `@fbr/flight-domain`, `@fbr/shared`   |
| `@fbr/analytics`        | pur : stats descriptives / groupées, tendance, `derivePriceEvents`, `buildAnalyticsReport` (garde « données insuffisantes »)                      | `@fbr/shared`                         |
| `@fbr/fx`               | pur : `FxProvider` (fixed / Frankfurter), `FxService` sur `RateStore` — normalisation en EUR                                                      | `@fbr/shared`                         |
| `@fbr/queue`            | BullMQ + Redis : connexion, file `search`, `createSearchWorker`, `enqueueSearchRun`                                                               | `@fbr/shared` (+ `bullmq`, `ioredis`) |
| `@fbr/database`         | schéma Drizzle (9 tables), client `postgres.js`, `runMigrations`, repositories typés (searches / combinations / offers / snapshots / events / fx) | `@fbr/shared`, `@fbr/config` (dev)    |

### Apps (état Phase 4)

| App           | Rôle             | Détail                                                                                                                                                                                                           |
| ------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fbr/api`    | API HTTP Fastify | `buildApp({ config, logger, db?, queue? })`. `/health` + `/api/searches` (CRUD, activate/pause, run, flights, prices, **analytics**, **events**). Controllers fins.                                              |
| `@fbr/worker` | Process de fond  | Scheduler + worker BullMQ : `ProviderRegistry` → `normalizer` → `price_snapshots` (append-only, `price_eur_cents` via `@fbr/fx`) → **`analyzeOffers`** (dérivation `price_events`) → replanification adaptative. |

`apps/web` (Next.js) est ajouté en **Phase 6**.

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
