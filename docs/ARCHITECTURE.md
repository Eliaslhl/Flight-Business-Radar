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

## Packages (état Phase 1)

| Package         | Rôle                                                                                                                                          | Dépend de                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `@fbr/shared`   | logger pino (redaction secrets), hiérarchie d'erreurs (`AppError` + `retryable`), `Result`, helpers monétaires (centimes entiers), `LogEvent` | —                                  |
| `@fbr/config`   | schéma Zod de l'environnement, `loadConfig()` fail-fast, singleton `getConfig()`                                                              | `@fbr/shared`                      |
| `@fbr/database` | schéma Drizzle, client `postgres.js` (`createDatabase`), `pingDatabase`, runner de migrations                                                 | `@fbr/shared`, `@fbr/config` (dev) |

### Apps (état Phase 1)

| App           | Rôle             | Détail                                                                                                                                  |
| ------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `@fbr/api`    | API HTTP Fastify | `buildApp({ config, logger, db? })` → instance Fastify. Route `/health` (ping DB, 200 `ok` / 503 `degraded`). Routes métier en Phase 3. |
| `@fbr/worker` | Process de fond  | `createWorkerRuntime({ logger })` avec `start()` / `stop()` + heartbeat. Hébergera scheduler + workers BullMQ en Phase 3.               |

`apps/web` (Next.js) est ajouté en **Phase 6**.

## Résolution des packages

Chaque `package.json` expose une condition `development` pointant vers `src/index.ts` :

```jsonc
"exports": { ".": { "development": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" } }
```

- **Vitest** utilise la condition `development` (voir `vitest.workspace.ts`) → pas besoin de builder avant de tester.
- **Production / `node dist`** utilise `default` → `dist/*.js` (build `tsc -b`, ordonné par Turborepo via `^build`).
- **Typecheck** s'appuie sur les project references TypeScript (`tsconfig.json` racine).

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
