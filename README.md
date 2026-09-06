# Flight Business Radar

Moteur de surveillance et d'analyse des prix de billets d'avion en **Business Class** au départ de **Paris-CDG** : recherche sur plages de dates, historisation des prix, détection des baisses (y compris les _flash drops_ de quelques minutes), statistiques historiques, recommandation de périodes et notifications.

> Ce dépôt est un **produit logiciel** structuré (monorepo, DDD, tests, CI), pas un prototype. Il est développé **par phases** — voir [`docs/PHASE-0-DISCOVERY.md`](docs/PHASE-0-DISCOVERY.md).

## État d'avancement

| Phase | Contenu                                                                                    | Statut       |
| ----- | ------------------------------------------------------------------------------------------ | ------------ |
| 0     | Discovery : audit, providers, architecture, schéma, roadmap                                | ✅ Terminée  |
| 1     | Foundation : monorepo, TS strict, lint/format, tests, PostgreSQL/Redis, config, Docker, CI | ✅ Terminée  |
| 2     | Flight domain : `FlightOffer`, `FlightProvider`, `MockFlightProvider`, normalizer          | ✅ Terminée  |
| 3     | Search engine : recherches, génération de dates, queue, scheduler, workers                 | ✅ Terminée  |
| 4     | Price history : snapshots, statistiques, tendances                                         | 🟢 Prochaine |
| 5     | Alert engine : target / drop / flash drop / record low, cooldown, confirmation             | ⏳           |
| 6     | Frontend : dashboard Next.js, graphiques, alertes                                          | ⏳           |
| 7     | Real providers : SerpApi puis Duffel                                                       | ⏳           |
| 8     | Notifications : email, Telegram, push                                                      | ⏳           |
| 9     | Smart recommendations : opportunity score, dates, Radar                                    | ⏳           |
| 10    | AI Advisor                                                                                 | ⏳           |

## Prérequis

- Node **≥ 20.11** (24 recommandé, voir `.nvmrc`)
- pnpm **≥ 9** (`corepack enable`)
- Docker (pour PostgreSQL + Redis en local)

## Démarrage

```bash
corepack enable
pnpm install
cp .env.example .env

# Base de données + Redis
docker compose up -d

# Vérification complète (typecheck + lint + format + build + tests)
pnpm typecheck && pnpm lint && pnpm test

# Migrations
pnpm db:migrate

# Lancer l'API (http://localhost:3001/health) et le worker
pnpm --filter @fbr/api dev
pnpm --filter @fbr/worker dev
```

## Structure

```
apps/
  api/       Fastify — API REST (+ /health)
  worker/    Process de fond (scheduler + workers BullMQ à partir de la Phase 3)
packages/
  shared/           logger pino, erreurs, Result, helpers monétaires, noms d'événements
  config/           chargement + validation d'environnement (Zod, fail-fast)
  flight-domain/    FlightSearchRequest, FlightOffer, value objects, fingerprint
  flight-providers/ interface FlightProvider, ProviderRegistry, MockFlightProvider
  normalizer/       contrôle qualité + déduplication des offres
  search-engine/    génération de dates, priorité, surveillance adaptative (pur)
  queue/            BullMQ + Redis (file `search`, worker)
  database/         schéma Drizzle + client postgres.js + migrations + repositories
docs/               ARCHITECTURE, DATABASE, API, WORKERS, FLIGHT_PROVIDERS, DEVELOPMENT, PHASE-0-DISCOVERY
```

## Scripts racine

| Script                              | Rôle                                          |
| ----------------------------------- | --------------------------------------------- |
| `pnpm build`                        | Build de tous les packages/apps (Turborepo)   |
| `pnpm typecheck`                    | `tsc` strict sur tout le monorepo             |
| `pnpm lint` / `pnpm lint:fix`       | ESLint 9 (flat config, type-checked)          |
| `pnpm format` / `pnpm format:check` | Prettier                                      |
| `pnpm test`                         | Vitest (tous les packages)                    |
| `pnpm db:generate`                  | Génère une migration Drizzle depuis le schéma |
| `pnpm db:migrate`                   | Applique les migrations à `DATABASE_URL`      |

## Licence / cadre d'usage

Outil de **recherche, surveillance et recommandation** de prix à usage personnel. Il ne vend pas de billets : la réservation se fait via le lien du fournisseur. Voir [`docs/PHASE-0-DISCOVERY.md`](docs/PHASE-0-DISCOVERY.md) §3 pour les aspects légaux et CGU.
