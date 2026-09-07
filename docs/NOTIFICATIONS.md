# Alertes & notifications

> Cf. `PHASE-0-DISCOVERY.md` §10 (confirmation des prix) et §16 (types de notifications).

## Types d'alerte

| Type            | Déclenché par (`price_events`) | Confirmation ? |
| --------------- | ------------------------------ | -------------- |
| `TARGET_PRICE`  | `TARGET_HIT`                   | non            |
| `PRICE_DROP`    | `DROP`, `FLASH_DROP`           | non            |
| `FLASH_DROP`    | `FLASH_DROP`                   | **oui**        |
| `RECORD_LOW`    | `RECORD_LOW`                   | **oui**        |
| `UNUSUAL_PRICE` | `UNUSUAL`                      | **oui**        |

`thresholdEurCents` (optionnel) agit comme **plafond de prix** pour `TARGET_PRICE` / `RECORD_LOW` : l'alerte ne se déclenche qu'en dessous.

## `@fbr/alerting` (pur)

- `matchAlerts(events, alerts)` : associe les événements aux alertes activées, **un seul match par alerte** (l'événement le plus fort — `FLASH_DROP` > `RECORD_LOW` > … > `DROP`).
- `isInCooldown(alert, now)` / `cooldownRemainingSeconds(...)` : anti-spam par alerte.
- `needsConfirmation(alertType)` : `FLASH_DROP` / `RECORD_LOW` / `UNUSUAL_PRICE`.
- `isPriceConfirmed(targetEurCents, recheck, tolerance=0.03)` : `true` si la re-vérification renvoie une offre **disponible** (`AVAILABLE`/`LOW`) sous le prix (± tolérance). L'**oracle Duffel** (si `DUFFEL_API_TOKEN`) renvoie du contenu réservable → `AVAILABLE` ; les providers de scraping/SerpApi renvoient `UNKNOWN` → la confirmation ne peut aboutir que via l'oracle ou le `MockFlightProvider`. Voir [`FLIGHT_PROVIDERS.md`](FLIGHT_PROVIDERS.md).
- `buildAlertNotification(match, ctx)` : sujet + corps FR + `dedupeKey` = `search:type:destination:outboundDate:jour`.

## `@fbr/notifications`

- `NotificationChannel` : `send(notification) → { channel, ok, error? }`. Implémenter Email / Telegram / Discord = ajouter une classe, **sans toucher au moteur de prix** (Phase 8).
- `NotificationService.dispatch(n)` : diffuse sur tous les canaux (`Promise.allSettled`) — un canal en échec n'empêche pas les autres, chaque résultat devient une ligne `notifications` (`SENT` / `FAILED`).

### Canaux (Phase 8)

| Canal      | Classe            | Transport                             | Config requise (`@fbr/config`)            |
| ---------- | ----------------- | ------------------------------------- | ----------------------------------------- |
| `CONSOLE`  | `ConsoleChannel`  | logs structurés (`notification_sent`) | — (toujours actif)                        |
| `TELEGRAM` | `TelegramChannel` | API Bot `sendMessage` (`fetch`)       | `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` |
| `EMAIL`    | `EmailChannel`    | SMTP via `nodemailer`                 | `SMTP_URL` + `EMAIL_FROM` + `EMAIL_TO`    |
| `WEBHOOK`  | `WebhookChannel`  | `POST` JSON (`fetch`)                 | `NOTIFICATION_WEBHOOK_URL`                |

- **Activation par présence de config** : le worker (`apps/worker/src/notifications.ts` → `buildNotificationService`) ajoute un canal **uniquement** si toute sa config est renseignée. `CONSOLE` est toujours là. Ajouter un canal = une classe `NotificationChannel` + une ligne dans ce factory — le moteur de prix n'est jamais touché (Phase 0 §16).
- **Retry** : `withRetry` (backoff linéaire, `NOTIFICATION_MAX_ATTEMPTS`, défaut 3) enveloppe chaque canal réseau ; timeout dur par tentative (`NOTIFICATION_TIMEOUT_MS`, défaut 10 s). Un échec final n'est jamais propagé — il est historisé `FAILED` (pattern outbox).
- **Payloads** :
  - Telegram / Webhook : `sujet + corps` en texte ; le webhook émet aussi `content` (Discord), `text` (Slack / ntfy) et les champs structurés (`type`, `dedupeKey`, `payload`).
  - Email : `text` = corps, `subject` = sujet, `from` / `to` = config.
- **Secrets** : jamais committés — `TELEGRAM_BOT_TOKEN` / `SMTP_URL` sont des `optionalSecret` (`.env` local uniquement). L'URL webhook porte elle-même son jeton.
- **Push mobile** : reporté (nécessite VAPID + service worker côté dashboard + persistance des souscriptions ; à reprendre avec une app mobile ou après la Phase 10). `WEBHOOK` couvre le besoin « push-like » en attendant (ntfy, Discord…).

### Test manuel d'un canal (local, gratuit)

```bash
# Webhook : n'importe quel récepteur JSON (ici un mini serveur local)
NOTIFICATION_WEBHOOK_URL=http://localhost:9099 pnpm --filter @fbr/worker dev
# Email : MailHog en local
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
SMTP_URL=smtp://localhost:1025 EMAIL_FROM=radar@localhost EMAIL_TO=me@localhost pnpm --filter @fbr/worker dev
```

## Pipeline (`apps/worker/src/alert-pipeline.ts`)

Exécuté après `analyzeOffers`, pour chaque `price_event` nouvellement détecté :

```
matchAlerts
  │
  ├─ isInCooldown ?            → skip (log alert_cooldown)
  ├─ notificationExists(key) ? → SUPPRESSED (dédup, une par jour)
  ├─ needsConfirmation ?
  │     └─ confirm(request)  (oracle Duffel si DUFFEL_API_TOKEN — contenu réservable ;
  │                           sinon / si échec Duffel : re-requête des providers de recherche)
  │          ├─ isPriceConfirmed → markPriceEventsConfirmed + snapshot CONFIRMED
  │          └─ sinon            → snapshot EXPIRED, PAS de notification (price_expired)
  │
  └─ NotificationService.dispatch → 1 ligne `notifications` par canal (SENT/FAILED)
     puis markAlertTriggered (démarre le cooldown)
```

`SearchRunSummary` expose `alertsTriggered`, `alertsSuppressed`, `confirmationsFailed`.

## Tables

- `alerts` : `type`, `threshold_eur_cents`, `enabled`, `cooldown_seconds`, `last_triggered_at` ; index `(search_id, enabled)`.
- `notifications` : `channel` (`CONSOLE`/`EMAIL`/`TELEGRAM`/`WEBHOOK`/`DISCORD`/`PUSH` — migration `0005` ajoute `WEBHOOK`), `status` (`PENDING`/`SENT`/`FAILED`/`SUPPRESSED`), `subject`, `body`, `payload`, `dedupe_key`, `sent_at`, `error` ; **unique `(dedupe_key, channel)`** (un même événement peut donc être notifié une fois par canal).

## API

| Route                                           | Description                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST /api/alerts`                              | Crée une alerte (`{ searchId, type, thresholdEurCents?, enabled?, cooldownSeconds? }`) → `201` |
| `GET /api/alerts?searchId=`                     | Liste les alertes de l'utilisateur (filtre optionnel)                                          |
| `POST /api/alerts/:id/enable` \| `/disable`     | Active / désactive                                                                             |
| `DELETE /api/alerts/:id`                        | `204`                                                                                          |
| `GET /api/searches/:id/notifications?limit=200` | Historique des notifications                                                                   |
| `GET /api/notifications/channels`               | État des canaux (`{ name, configured }[]`) — **aucun secret**, sert au dashboard `/settings`   |
