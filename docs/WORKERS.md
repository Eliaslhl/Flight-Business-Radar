# Workers & Scheduler

> Cf. `PHASE-0-DISCOVERY.md` §7 (architecture) et §8 (surveillance adaptative).

## Vue d'ensemble

```
Scheduler (apps/worker)          File BullMQ `fbr-search`         Search worker (apps/worker)
─────────────────────────        ────────────────────────        ──────────────────────────
scan searches ACTIVE dont   ──▶  job { searchId, reason }   ──▶  processSearchRun(deps, job)
next_run_at <= now                                                 │
pose un bail sur next_run_at                                       ▼
(anti double-enqueue)                                    ProviderRegistry.searchAll
                                                                   │  (parallèle, échecs isolés)
                                                                   ▼
                                                        normalizeSearchResults (data quality + dédup)
                                                                   │
                                                                   ▼
                                                        upsert flight_offers / offer_provider_links
                                                        INSERT price_snapshots  (APPEND ONLY)
                                                                   │
                                                                   ▼
                                                        replanification adaptative :
                                                        computeSearchPriority + computeNextIntervalSeconds
                                                        → updateSearchSchedule(next_run_at, interval, priority)
```

L'API (`POST /api/searches/:id/run`) peut enfiler un job `reason: "manual"` immédiat.

### Runner one-shot (`apps/worker/src/once.ts`) — sans Redis

Pour un déploiement gratuit (cf. [`DEPLOY.md`](DEPLOY.md)), `@fbr/worker/once`
remplace scheduler + file + worker par **un passage unique** : `listDueSearches`
→ `processSearchRun` en boucle séquentielle → `pruneOldSnapshots`. Aucune
connexion Redis. `--migrate` applique d'abord les migrations. Pensé pour un cron
(GitHub Actions, `*/15`). `ONCE_MAX_SEARCHES` plafonne le lot ;
`SNAPSHOT_RETENTION_DAYS` pilote la purge. `main.ts` (long-running) exige
toujours `REDIS_URL` et sort en `1` s'il manque.

## `@fbr/queue`

| Élément                                                      | Rôle                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| `createQueueConnection(url)`                                 | `ioredis` avec `maxRetriesPerRequest: null` (requis par BullMQ)       |
| `QUEUE_NAMES`                                                | `fbr-search`, `fbr-analyze`, `fbr-confirm`, `fbr-notify` (pas de `:`) |
| `createSearchQueue(conn)`                                    | file `search` : `attempts: 3`, backoff exponentiel, purge auto        |
| `enqueueSearchRun(queue, data, { jobId?, delayMs? })`        | `jobId` explicite ⇒ déduplication                                     |
| `createSearchWorker(processor, { connection, concurrency })` | wrapper `Worker` BullMQ                                               |

## Scheduler (`apps/worker/src/scheduler.ts`)

- `createScheduler({ db, queue, logger, intervalMs, leaseSeconds })` → `start()` / `stop()` / `tick()`.
- Chaque `tick` : `listDueSearches(now)` → `enqueueSearchRun` (jobId `sched:<id>:<nextRunAt>`) → pose un **bail** `next_run_at = now + leaseSeconds`. Le worker recalcule ensuite la vraie cadence.
- Ne lève jamais : une erreur de scan est loguée et le tick suivant réessaie.

## Processeur (`apps/worker/src/search-processor.ts`)

`processSearchRun(deps, job)` — `deps = { db, registry, logger, combinationsPerRun, providerMinIntervalSeconds, now? }` :

1. charge la recherche ; ignore un job `scheduled` si `status !== ACTIVE` ;
2. génère les combinaisons de dates si absentes (`generateDateCombinations`) ;
3. sélectionne les `combinationsPerRun` combinaisons prioritaires (`pickCombinations` : jamais vérifiées d'abord, puis score) ;
   - **mode Radar** (recherche sans destination) : ne garde qu'un couple de dates, mais l'éclate sur `radarDestinationSlice(⌊runAt / 10 min⌋, RADAR_BATCH_SIZE)` — une tranche rotative de la liste seed CDG long-courrier (`@fbr/flight-domain`). Voir [`RECOMMENDATIONS.md`](RECOMMENDATIONS.md) ;
4. pour chaque combinaison : `buildRequestForCombination` → `registry.searchAll` → `normalizeSearchResults` ; chaque `outcome` (succès **ou** échec) est bufferisé pour `provider_requests` ; **`dedupeAgainstExistingSnapshots`** écarte ensuite les lignes déjà en base au même `(flight_offer_id, observed_at)` — utile pour les sources à données en cache (Travelpayouts, `observedAt` = `found_at`) ;
5. `upsertOffer` + `upsertProviderLink` + **INSERT** `price_snapshots` (jamais d'écrasement), avec `price_eur_cents` normalisé par `FxService` (`@fbr/fx`) ;
6. `insertProviderRequests` (journal d'observabilité : `provider, ok, offer_count, latency_ms, error_code/message`) puis `markCombinationsChecked` ;
7. **passe `analyze`** (`analyzeOffers`, Phase 4) : par offre touchée, `derivePriceEvents` (`@fbr/analytics`) → INSERT `price_events` + résolution des baisses ouvertes revenues ;
8. **pipeline d'alerte** (`runAlertPipeline`, Phase 5) : `matchAlerts` → cooldown → dédup (`dedupe_key`) → **confirmation** des prix exceptionnels via l'**oracle Duffel** (`buildConfirmer(registry, fx, { oracle })` — contenu réservable ; repli sur les providers de recherche si `DUFFEL_API_TOKEN` absent ou si Duffel échoue) → `NotificationService.dispatch` sur les canaux actifs (`buildNotificationService`, Phase 8 : console + Telegram / Email / Webhook selon la config) → une ligne `notifications` par canal (`SENT`/`FAILED`) ; voir [`NOTIFICATIONS.md`](NOTIFICATIONS.md) et [`FLIGHT_PROVIDERS.md`](FLIGHT_PROVIDERS.md) ;
9. `computeNextIntervalSeconds` (palier COLD/NORMAL/WARM/HOT/VERIFY + plancher provider + jitter) et `computeSearchPriority` → `updateSearchSchedule`.

Retourne un `SearchRunSummary` (combinaisons, offres, snapshots, meilleur prix, `eventsDetected`, `eventsResolved`, `alertsTriggered`, `alertsSuppressed`, `confirmationsFailed`, palier, prochain intervalle, erreurs provider).

## Surveillance adaptative (`@fbr/search-engine`)

| Palier   | Déclencheur (défaut, config)                                | Intervalle défaut |
| -------- | ----------------------------------------------------------- | ----------------- |
| `VERIFY` | une baisse vient d'être détectée                            | 30 s              |
| `HOT`    | prix ≤ cible, ou ≤ p10 historique, ou baisse récente ≥ 10 % | 120 s             |
| `WARM`   | prix ≤ cible × 1,15, ou baisse récente ≥ 3 %                | 600 s             |
| `NORMAL` | des offres existent sous le budget                          | 1800 s            |
| `COLD`   | aucune offre exploitable                                    | 3600 s            |

Départ imminent (`daysUntilDeparture ≤ 10`) → resserre d'un cran. Jitter ±10 % (anti thundering herd). Plancher = `PROVIDER_MIN_INTERVAL_SECONDS`. Les entrées historiques (`p10`, `minEver`, `recentDropPct`) sont alimentées à partir de la **Phase 4**.

## Configuration (`.env`)

| Variable                                                                             | Défaut                 | Rôle                                                                                                                           |
| ------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `SCHEDULER_INTERVAL_MS`                                                              | 15000                  | Période de scan des recherches dues                                                                                            |
| `SEARCH_WORKER_CONCURRENCY`                                                          | 4                      | Jobs `search.run` traités en parallèle                                                                                         |
| `SEARCH_COMBINATIONS_PER_RUN`                                                        | 6                      | Combinaisons sondées par exécution                                                                                             |
| `RADAR_BATCH_SIZE`                                                                   | 8                      | Mode Radar : destinations seed sondées par run (tranche rotative)                                                              |
| `PROVIDER_MIN_INTERVAL_SECONDS`                                                      | 60                     | Plancher d'intervalle (rate limit provider)                                                                                    |
| `MOCK_SCENARIO`                                                                      | normal                 | Scénario du `MockFlightProvider` (si aucun provider réel configuré)                                                            |
| `SERPAPI_API_KEY` (+ `SERPAPI_TIMEOUT_MS`, `SERPAPI_MAX_DESTINATIONS`)               | _(vide)_               | Active `SerpApiFlightProvider` (payant — 1 recherche = 1 crédit). Voir [`FLIGHT_PROVIDERS.md`](FLIGHT_PROVIDERS.md)            |
| `TRAVELPAYOUTS_TOKEN` (+ `TRAVELPAYOUTS_MARKER`, `_TIMEOUT_MS`, `_MAX_DESTINATIONS`) | _(vide)_               | Active `TravelpayoutsProvider` (gratuit, **données en cache ~48 h**). Seule source réelle ⇒ plancher d'intervalle relevé à 3 h |
| `FAST_FLIGHTS_URL`                                                                   | _(vide)_               | URL du sidecar `services/flight-scraper` → active `FastFlightsProvider`                                                        |
| `FAST_FLIGHTS_TIMEOUT_MS`                                                            | 20000                  | Timeout par appel au sidecar                                                                                                   |
| `FX_SOURCE` / `FX_FIXED_RATES`                                                       | frankfurter            | Source des taux de change / taux fixes JSON                                                                                    |
| `DROP_PCT` / `FLASH_DROP_PCT` / `FLASH_DROP_ABS_EUR` / `FLASH_WINDOW_MINUTES`        | 0.05 / 0.12 / 120 / 90 | Seuils de détection de baisse                                                                                                  |
| `ANALYTICS_MIN_SAMPLE`                                                               | 30                     | Échantillon minimal (`UNUSUAL`, fiabilité)                                                                                     |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`                                            | _(vide)_               | Active le canal `TELEGRAM` (les deux requis)                                                                                   |
| `SMTP_URL` + `EMAIL_FROM` + `EMAIL_TO`                                               | _(vide)_               | Active le canal `EMAIL` (SMTP `nodemailer`, les trois requis)                                                                  |
| `NOTIFICATION_WEBHOOK_URL`                                                           | _(vide)_               | Active le canal `WEBHOOK` (POST JSON — Discord / Slack / ntfy / custom)                                                        |
| `NOTIFICATION_TIMEOUT_MS` / `NOTIFICATION_MAX_ATTEMPTS`                              | 10000 / 3              | Timeout dur et nombre de tentatives par canal réseau                                                                           |
