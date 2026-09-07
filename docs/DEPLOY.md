# Déploiement

Deux cibles documentées. **L'option A ne coûte rien** et n'a aucune machine à
administrer ; l'option B garde le worker temps réel intact.

| Brique          | Option A — free tiers + cron             | Option B — VM unique           |
| --------------- | ---------------------------------------- | ------------------------------ |
| `web` (Next.js) | Vercel Hobby                             | Nginx + `next start` sur la VM |
| `api` (Fastify) | Render free web service                  | `node apps/api/dist/server.js` |
| Postgres        | Neon free                                | conteneur `postgres`           |
| Redis           | — (supprimé)                             | conteneur `redis`              |
| Surveillance    | cron GitHub Actions → `@fbr/worker/once` | `@fbr/worker` long-running     |
| Scraper Python  | non déployé                              | conteneur optionnel            |

> **Secrets** : rien n'est jamais commité. Tous les jetons vivent dans les
> variables d'environnement de la plateforme (Vercel / Render / _repo secrets_
> GitHub). `.env.example` est le seul modèle versionné.

---

## Option A — gratuit, sans serveur à gérer

Architecture : le frontend et l'API sont hébergés sur des free tiers ; le worker
long-running et Redis sont **remplacés par un cron GitHub Actions** qui exécute
un passage unique (`@fbr/worker/once`) toutes les 15 min. La source Travelpayouts
étant en cache (~48 h, plancher d'intervalle 3 h), cette cadence est large.

```
GitHub Actions (cron */15)          Vercel                Render            Neon
  └─ node worker/dist/once.js        └─ web (Next.js) ──►  └─ api ──────────► └─ Postgres
       --migrate                          rewrites /api/*     Fastify   ▲
       ├─ migrations                                                    │
       ├─ recherches dues → snapshots / events / alertes ───────────────┘
       ├─ notifications (Telegram / webhook / e-mail)
       └─ purge des snapshots > SNAPSHOT_RETENTION_DAYS
```

### 1. Base de données — Neon

1. Créer un projet sur [neon.tech](https://neon.tech) (region **EU** de préférence).
2. Copier la chaîne de connexion **pooled** (`...-pooler...`, `sslmode=require`).
   C'est le `DATABASE_URL` utilisé partout.
3. Les migrations sont appliquées automatiquement par le cron (`once --migrate`).
   Pour les jouer à la main : `DATABASE_URL=... pnpm db:migrate`.

### 2. API — Render

Le dépôt contient un blueprint [`render.yaml`](../render.yaml).

1. Sur [render.com](https://render.com) : **New ▸ Blueprint**, pointer sur le repo.
2. Renseigner les variables marquées `sync: false` : `DATABASE_URL` (Neon),
   éventuellement `ANTHROPIC_API_KEY`.
3. Déployer. L'URL publique ressemble à `https://fbr-api.onrender.com`.
   Vérifier `GET /health` → `{ "status": "ok" }`.

Notes :

- Plan gratuit ⇒ le service **s'endort après 15 min** sans trafic ; le premier
  appel ensuite prend ~50 s. Sans impact sur le cron, qui parle direct à Neon.
- L'API tourne **sans `REDIS_URL`** : `POST /api/searches/:id/run` (enqueue
  manuel) répond alors `503`. Tout le reste est en lecture et fonctionne.

### 3. Frontend — Vercel

1. **New Project** ▸ importer le repo. _Root Directory_ = `apps/web`.
   Vercel détecte Next.js et pnpm ; le monorepo est géré automatiquement.
2. Variable d'environnement : `API_INTERNAL_URL = https://fbr-api.onrender.com`
   (consommée par les `rewrites` de [`next.config.mjs`](../apps/web/next.config.mjs) —
   le navigateur ne voit que des chemins `/api/*` relatifs).
3. Déployer.

> Vercel Hobby est réservé à un usage **non commercial** — OK pour un dashboard
> perso. Une exploitation commerciale impose un plan payant.

### 4. Surveillance — cron GitHub Actions

Le workflow [`.github/workflows/poll.yml`](../.github/workflows/poll.yml) est déjà
dans le repo. Il faut juste renseigner les **repo secrets**
(_Settings ▸ Secrets and variables ▸ Actions_) :

| Secret                                    | Requis     | Rôle                                        |
| ----------------------------------------- | ---------- | ------------------------------------------- |
| `DATABASE_URL`                            | ✅         | même chaîne Neon que l'API                  |
| `TRAVELPAYOUTS_TOKEN`                     | recommandé | source de prix réelle gratuite (sinon mock) |
| `TRAVELPAYOUTS_MARKER`                    | facultatif | active les liens de réservation Aviasales   |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | facultatif | notifications push                          |
| `NOTIFICATION_WEBHOOK_URL`                | facultatif | notifications Discord / Slack / ntfy        |
| `SMTP_URL` + `EMAIL_FROM` + `EMAIL_TO`    | facultatif | notifications e-mail                        |
| `ANTHROPIC_API_KEY`                       | facultatif | rédaction du conseil par Claude             |

Le cron tourne toutes les 15 min ; `workflow_dispatch` permet un lancement
manuel. Un `concurrency.group` empêche deux passages simultanés. Les exécutions
GitHub Actions sont _best-effort_ (parfois 10-15 min de retard) — sans
conséquence ici.

### 5. Créer une première recherche

Via l'UI (`https://<projet>.vercel.app`) ou l'API :

```bash
curl -X POST https://fbr-api.onrender.com/api/searches \
  -H 'content-type: application/json' \
  -d '{"origin":"CDG","destinations":["HND"],"cabinClass":"ECONOMY",
       "departureWindow":{"start":"2026-11-01","end":"2026-11-30"},
       "tripDuration":{"minDays":10,"maxDays":14}}'
```

`nextRunAt` est immédiat ⇒ le prochain tick du cron la traitera. Pour être
notifié quand le prix passe sous une cible : créer aussi une **alerte
`TARGET_PRICE`** sur la recherche (page `/alerts`) — le champ « prix cible » seul
ne notifie pas.

### Limites connues (option A)

- **Latence de fraîcheur** : au mieux ~15 min (cron) + fraîcheur Travelpayouts
  (~48 h). Ce n'est pas un détecteur de _flash drop_.
- **Stockage Neon gratuit** (~0,5 Go) : `price_snapshots` est purgé à
  `SNAPSHOT_RETENTION_DAYS` (180 j par défaut) à chaque passage du cron.
  Baisser cette valeur si l'espace se remplit ; l'historique d'analyse est
  tronqué d'autant.
- **Réveil à froid** Render (~50 s) et Neon (~0,5 s) sur le premier accès après
  inactivité.
- `workflow_dispatch` + `schedule` sur GitHub Actions sont désactivés si le repo
  reste **60 jours sans commit** (un push les réactive).

---

## Option B — VM unique (Docker)

Pour une VM « always free » (Oracle Cloud Ampere, 24 Go) ou tout VPS :
`docker compose up -d` avec un `docker-compose.yml` réunissant `postgres`,
`redis`, `api`, `worker`, `web` (+ profil `scraper` optionnel). Cette cible
n'est pas encore outillée dans le repo (compose de prod + Dockerfiles Node à
écrire) — ouvrir une issue si besoin. L'architecture applicative est inchangée :
`REDIS_URL` est renseigné, `@fbr/worker` tourne en continu, la latence retombe
à `PROVIDER_MIN_INTERVAL_SECONDS`.

---

## Runner one-shot — référence

`@fbr/worker/once` (fichier [`apps/worker/src/once.ts`](../apps/worker/src/once.ts)) :

```bash
pnpm --filter @fbr/worker build
node apps/worker/dist/once.js [--migrate]
```

1. `--migrate` (optionnel) : applique les migrations Drizzle en attente.
2. `listDueSearches` : recherches `ACTIVE` dont `nextRunAt <= maintenant`
   (plafond `ONCE_MAX_SEARCHES`).
3. Pour chacune : `processSearchRun` (providers → normalisation → snapshots →
   events → alertes → notifications → recalcul de `nextRunAt`). Un échec isolé
   est loggué et n'interrompt pas les suivantes.
4. `pruneOldSnapshots(SNAPSHOT_RETENTION_DAYS)`.
5. Sortie `0`. Sortie `1` seulement si **aucune** recherche n'a abouti alors
   qu'il y en avait — le cron marque alors l'exécution en échec.

Aucune connexion Redis n'est ouverte. Idempotent : deux passages rapprochés ne
double-comptent pas (`nextRunAt` est réavancé, et les données en cache passent
par `dedupeAgainstExistingSnapshots`).
