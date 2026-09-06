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
- `isPriceConfirmed(targetEurCents, recheck, tolerance=0.03)` : `true` si la re-requête renvoie une offre **disponible** (`AVAILABLE`/`LOW`) sous le prix (± tolérance).
- `buildAlertNotification(match, ctx)` : sujet + corps FR + `dedupeKey` = `search:type:destination:outboundDate:jour`.

## `@fbr/notifications`

- `NotificationChannel` : `send(notification) → { channel, ok, error? }`. Implémenter Email / Telegram / Discord = ajouter une classe, **sans toucher au moteur de prix** (Phase 8).
- `ConsoleChannel` : écrit dans les logs structurés (`notification_sent`).
- `NotificationService.dispatch(n)` : diffuse sur tous les canaux (`Promise.allSettled`) — un canal en échec n'empêche pas les autres.

## Pipeline (`apps/worker/src/alert-pipeline.ts`)

Exécuté après `analyzeOffers`, pour chaque `price_event` nouvellement détecté :

```
matchAlerts
  │
  ├─ isInCooldown ?            → skip (log alert_cooldown)
  ├─ notificationExists(key) ? → SUPPRESSED (dédup, une par jour)
  ├─ needsConfirmation ?
  │     └─ confirm(request)  (re-requête même provider, normalisée en EUR)
  │          ├─ isPriceConfirmed → markPriceEventsConfirmed + snapshot CONFIRMED
  │          └─ sinon            → snapshot EXPIRED, PAS de notification (price_expired)
  │
  └─ NotificationService.dispatch → 1 ligne `notifications` par canal (SENT/FAILED)
     puis markAlertTriggered (démarre le cooldown)
```

`SearchRunSummary` expose `alertsTriggered`, `alertsSuppressed`, `confirmationsFailed`.

## Tables

- `alerts` : `type`, `threshold_eur_cents`, `enabled`, `cooldown_seconds`, `last_triggered_at` ; index `(search_id, enabled)`.
- `notifications` : `channel`, `status` (`PENDING`/`SENT`/`FAILED`/`SUPPRESSED`), `subject`, `body`, `payload`, `dedupe_key`, `sent_at`, `error` ; **unique `(dedupe_key, channel)`**.

## API

| Route                                           | Description                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `POST /api/alerts`                              | Crée une alerte (`{ searchId, type, thresholdEurCents?, enabled?, cooldownSeconds? }`) → `201` |
| `GET /api/alerts?searchId=`                     | Liste les alertes de l'utilisateur (filtre optionnel)                                          |
| `POST /api/alerts/:id/enable` \| `/disable`     | Active / désactive                                                                             |
| `DELETE /api/alerts/:id`                        | `204`                                                                                          |
| `GET /api/searches/:id/notifications?limit=200` | Historique des notifications                                                                   |
