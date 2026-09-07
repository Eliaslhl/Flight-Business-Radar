# Flight Business Radar

Moteur de surveillance et d'analyse des prix de billets d'avion en **Business Class** au départ de **Paris-CDG** : recherche sur plages de dates, historisation des prix, détection des baisses (y compris les _flash drops_ de quelques minutes), statistiques historiques, recommandation de périodes et notifications.

> Ce dépôt est un **produit logiciel** structuré (monorepo, DDD, tests, CI), pas un prototype. Il est développé **par phases** — voir [`docs/PHASE-0-DISCOVERY.md`](docs/PHASE-0-DISCOVERY.md).

## État d'avancement

| Phase | Contenu                                                                                          | Statut      |
| ----- | ------------------------------------------------------------------------------------------------ | ----------- |
| 0     | Discovery : audit, providers, architecture, schéma, roadmap                                      | ✅ Terminée |
| 1     | Foundation : monorepo, TS strict, lint/format, tests, PostgreSQL/Redis, config, Docker, CI       | ✅ Terminée |
| 2     | Flight domain : `FlightOffer`, `FlightProvider`, `MockFlightProvider`, normalizer                | ✅ Terminée |
| 3     | Search engine : recherches, génération de dates, queue, scheduler, workers                       | ✅ Terminée |
| 4     | Price history : snapshots, statistiques, tendances, détection d'événements, FX                   | ✅ Terminée |
| 5     | Alert engine : target / drop / flash drop / record low, cooldown, confirmation                   | ✅ Terminée |
| 6     | Frontend : dashboard Next.js, graphiques, alertes                                                | ✅ Terminée |
| 7     | Real providers : sidecar Python `fast-flights` (fixture + live best-effort), `provider_requests` | ✅ Terminée |
| 8     | Notifications : canaux Telegram / Email (SMTP) / Webhook, retry, auto-activation par config      | ✅ Terminée |
| 9     | Smart recommendations : opportunity score, top-3 dates, mode Radar (classement destinations)     | ✅ Terminée |
| 10    | AI Advisor : conseil FR à partir des stats, garde-fou anti-invention + eval, Claude optionnel    | ✅ Terminée |

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

# Lancer l'API, le worker et le dashboard
pnpm --filter @fbr/api dev      # http://localhost:3001/health
pnpm --filter @fbr/worker dev
pnpm --filter @fbr/web dev      # http://localhost:3000  (proxy /api → API)
```

### Données de vol réelles (optionnel)

Par défaut le worker utilise `MockFlightProvider`. Deux providers réels, activés par
simple présence de config (les deux peuvent tourner en parallèle) :

```bash
# Gratuit, 100 % local — sidecar Python fast-flights (best-effort)
docker compose --profile scraper up -d flight-scraper   # http://localhost:8000
echo "FAST_FLIGHTS_URL=http://localhost:8000" >> .env

# Payant — SerpApi Google Flights (1 recherche = 1 crédit)
echo "SERPAPI_API_KEY=…" >> .env
```

Détails, coûts et garde-fous : [`docs/FLIGHT_PROVIDERS.md`](docs/FLIGHT_PROVIDERS.md).

### Notifications (optionnel, Phase 8)

Le canal `console` (logs) est toujours actif. Chaque autre canal s'active dès que
**toute** sa config est présente dans `.env` — aucun code à toucher :

```bash
# Telegram (gratuit) — bot via @BotFather + chat id
TELEGRAM_BOT_TOKEN=…   TELEGRAM_CHAT_ID=…
# Email — n'importe quel SMTP (MailHog en local : docker run -p 1025:1025 -p 8025:8025 mailhog/mailhog)
SMTP_URL=smtp://localhost:1025   EMAIL_FROM=radar@localhost   EMAIL_TO=me@localhost
# Webhook — Discord / Slack / ntfy / custom
NOTIFICATION_WEBHOOK_URL=https://…
```

`GET /api/notifications/channels` indique les canaux actifs. Détails :
[`docs/NOTIFICATIONS.md`](docs/NOTIFICATIONS.md).

## Structure

```
apps/
  api/       Fastify — API REST (+ /health)
  worker/    Process de fond : scheduler + workers BullMQ + analyse + alertes
  web/       Next.js 15 — dashboard (TanStack Query, Recharts), proxy /api → API
packages/
  shared/           logger pino, erreurs, Result, helpers monétaires, noms d'événements
  config/           chargement + validation d'environnement (Zod, fail-fast)
  flight-domain/    FlightSearchRequest, FlightOffer, value objects, fingerprint
  flight-providers/ interface FlightProvider, ProviderRegistry, Mock/Fixture/FastFlights providers
  normalizer/       contrôle qualité + déduplication des offres
  search-engine/    génération de dates, priorité, surveillance adaptative (pur)
  analytics/        stats, tendance, price_events, opportunity score + recommandations (pur)
  advisor/          conseil langage naturel + garde-fou anti-invention (pur ; Claude optionnel)
  fx/               taux de change + normalisation en EUR (pur)
  alerting/         matching alertes, cooldown, confirmation, messages (pur)
  notifications/    NotificationService + canaux Console / Telegram / Email (SMTP) / Webhook + retry
  queue/            BullMQ + Redis (file `search`, worker)
  database/         schéma Drizzle + client postgres.js + migrations + repositories
services/
  flight-scraper/   sidecar Python (FastAPI) isolant le scraper Google Flights `fast-flights`
docs/               ARCHITECTURE, DATABASE, API, WORKERS, ANALYTICS, RECOMMENDATIONS, AI_ADVISOR, NOTIFICATIONS, FRONTEND, FLIGHT_PROVIDERS, DEVELOPMENT, PHASE-0-DISCOVERY
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
