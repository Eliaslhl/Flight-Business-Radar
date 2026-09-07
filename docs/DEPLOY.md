# Déploiement

Deux cibles documentées. **L'option A ne coûte rien** et n'a aucune machine à
administrer ; l'option B garde le worker temps réel intact.

| Brique          | Option A — free tiers + cron             | Option B — VM unique           |
| --------------- | ---------------------------------------- | ------------------------------ |
| `web` (Next.js) | Render free web service                  | Nginx + `next start` sur la VM |
| `api` (Fastify) | Render free web service                  | `node apps/api/dist/server.js` |
| Postgres        | Neon free                                | conteneur `postgres`           |
| Redis           | — (supprimé)                             | conteneur `redis`              |
| Surveillance    | cron GitHub Actions → `@fbr/worker/once` | `@fbr/worker` long-running     |
| Scraper Python  | non déployé                              | conteneur optionnel            |

> **Secrets** : rien n'est jamais commité. Tous les jetons vivent dans les
> variables d'environnement de la plateforme (Render / _repo secrets_ GitHub).
> `.env.example` est le seul modèle versionné.

---

## Option A — gratuit, sans serveur à gérer

Architecture : **Neon** (Postgres) + **Render** (héberge l'API _et_ le front,
via un blueprint unique) + un **cron GitHub Actions** qui remplace le worker
long-running et Redis en exécutant un passage unique (`@fbr/worker/once`) toutes
les 15 min. La source Travelpayouts étant en cache (~48 h, plancher d'intervalle
3 h), cette cadence est large.

```
GitHub Actions (cron */15)          Render                              Neon
  └─ node worker/dist/once.js        ├─ flight-radar  (Next.js) ──rewrites──┐
       --migrate                     │                     /api/*      ▼
       ├─ migrations                 └─ fbr-api  (Fastify) ───────────► Postgres
       ├─ recherches dues → snapshots / events / alertes ──────────────┘  ▲
       ├─ notifications (Telegram / webhook / e-mail)                     │
       └─ purge des snapshots > SNAPSHOT_RETENTION_DAYS ─────────────────┘
```

### 1. Base de données — Neon

1. Créer un compte sur [neon.tech](https://neon.tech) (**Sign up with GitHub**).
2. **Create project** — région proche de Render (ex. _AWS US East (Ohio)_ =
   `us-east-2`, ou une région EU si tu préfères, mais alors régler Render sur
   `frankfurt` dans [`render.yaml`](../render.yaml)).
3. Copier la chaîne **pooled** affichée (elle contient `-pooler` et
   `sslmode=require`). Retirer `&channel_binding=require` s'il est présent (le
   driver `postgres.js` ne le négocie pas). C'est le `DATABASE_URL`.
4. Rien d'autre : les migrations sont jouées par le cron (`once --migrate`).
   Pour tester à la main : `DATABASE_URL='...' pnpm db:migrate`.

> ⚠️ Un `DATABASE_URL` contient un mot de passe. Ne jamais le committer ni le
> coller ailleurs que dans les champs « secret » de Render et GitHub. Si tu l'as
> exposé, régénère-le : Console Neon → **Roles** → _Reset password_.

### 2. API + front — Render (un seul blueprint)

Le dépôt contient [`render.yaml`](../render.yaml) : il déclare **deux** services
web gratuits, `fbr-api` et `flight-radar`. `flight-radar` reçoit automatiquement l'URL de
`fbr-api` (`API_INTERNAL_URL`, via `fromService`) — rien à recopier entre les
deux.

1. Sur [render.com](https://render.com) : **Sign up with GitHub**.
2. **New ▸ Blueprint** → sélectionner le dépôt `Flight-Business-Radar`.
   Render lit `render.yaml` et propose de créer `fbr-api` + `flight-radar`.
3. Il demande les variables `sync: false` : coller `DATABASE_URL` (Neon) sur
   `fbr-api`. `ANTHROPIC_API_KEY` est facultatif (laisser vide sinon).
4. **Apply**. Au bout de ~3-5 min :
   - `https://fbr-api.onrender.com/health` → `{ "status": "ok" }`
   - `https://flight-radar.onrender.com` → le dashboard

Notes :

- Plan gratuit ⇒ chaque service **s'endort après 15 min** sans trafic ; le
  premier accès ensuite prend ~50 s (jusqu'à ~100 s si web _et_ api étaient
  endormis). Sans impact sur le cron, qui parle directement à Neon.
- L'API tourne **sans `REDIS_URL`** : `POST /api/searches/:id/run` (relance
  manuelle) répond `503`. Tout le reste fonctionne.
- Les noms `fbr-api` / `flight-radar` peuvent recevoir un suffixe si déjà pris sur
  Render ; l'`API_INTERNAL_URL` par `fromService` suit automatiquement.

### 3. Surveillance — cron GitHub Actions

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

### 4. Créer un compte

`SESSION_SECRET` étant défini sur `fbr-api` (le blueprint le génère), l'API
exige une connexion. Ouvre `https://flight-radar.onrender.com` → **Créer un
compte** (e-mail + mot de passe ≥ 8 caractères). Le **premier** compte adopte
automatiquement les recherches / alertes déjà présentes.

> Le cron GitHub Actions n'a **pas** besoin de `SESSION_SECRET` : il opère au
> niveau système (toutes les recherches actives, tous comptes confondus).

### 5. Créer une première recherche

Depuis l'UI (bouton **+ Nouvelle recherche**). `nextRunAt` est immédiat ⇒ le
prochain tick du cron la traitera. Pour être notifié quand le prix passe sous
une cible : créer aussi une **alerte `TARGET_PRICE`** sur la recherche (page
`/alerts`) — le champ « prix cible » seul ne notifie pas.

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
