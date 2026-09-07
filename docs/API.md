# API HTTP

Base : `http://localhost:3001` (config `API_HOST` / `API_PORT`). Fastify + logger pino.
Auth : **aucune** en Phase 3 — toutes les recherches appartiennent à l'utilisateur de dev.
Les montants sont en **centimes entiers** (`*Cents`).

## `GET /health`

`200` `{ status: "ok", service, version, uptimeSeconds, checks: { database } }` — `503` + `status: "degraded"` si la base est injoignable.

## Recherches

### `POST /api/searches` → `201`

Corps (Zod, cf. `apps/api/src/schemas.ts`) :

```jsonc
{
  "label": "CDG → Tokyo Business", // optionnel
  "origin": "CDG",
  "destinations": ["HND"], // [] ⇒ mode Radar (Phase 9)
  "cabinClass": "BUSINESS", // défaut BUSINESS
  "departureWindow": { "start": "2026-11-01", "end": "2026-11-30" },
  "tripDuration": { "minDays": 10, "maxDays": 14 },
  "maxStops": 1, // défaut 1
  "maxPriceCents": 200000, // optionnel
  "targetPriceCents": 130000, // optionnel, ≤ maxPriceCents
  "currency": "EUR", // défaut EUR
  "preferredAirlines": [],
  "excludedAirlines": [],
  "intervalSeconds": 1800, // optionnel
}
```

Réponse : le DTO de la recherche + `dateCombinations` (nombre de couples générés).
`400` `{ error: "VALIDATION_FAILED", issues: [{ path, message }] }` si le corps est invalide.

### `GET /api/searches` → `{ searches: SearchDto[] }`

### `GET /api/searches/:id` → `SearchDto` | `404`

### `DELETE /api/searches/:id` → `204` | `404`

### `POST /api/searches/:id/activate` → `SearchDto`

Passe `status = ACTIVE` et remet `nextRunAt = now` (le scheduler la reprendra).

### `POST /api/searches/:id/pause` → `SearchDto`

Passe `status = PAUSED` (les jobs planifiés sont ignorés par le worker).

### `POST /api/searches/:id/run` → `202 { enqueued: true, jobId }`

Enfile un job `search.run` immédiat (`reason: "manual"`). `503` si la file Redis n'est pas branchée. `404` si la recherche n'existe pas.

### `GET /api/searches/:id/flights` → `{ flights: [...] }`

Dernière observation **par offre** pour la recherche (`DISTINCT ON`), triée par prix croissant :
`{ fingerprint, origin, destination, cabinClass, outboundDate, returnDate, tripDays, marketingAirline, maxStops, latestPriceCents, currency, availability, observedAt, offer }` (`offer` = payload `FlightOffer` complet).

### `GET /api/searches/:id/prices?limit=500` → `{ prices: [...] }`

Historique brut des snapshots (append-only), le plus récent d'abord :
`{ id, flightOfferId, provider, priceCents, priceEurCents, currency, availability, status, observedAt }`.

### `GET /api/searches/:id/analytics` → `AnalyticsReport`

`buildAnalyticsReport` sur toutes les observations `price_eur_cents` de la recherche (devise unique EUR) :
`{ currency: "EUR", sampleSize, reliable, summary, trend, best, latest, byMonth[], byDayOfWeek[], byTripDuration[], byAirline[], byStops[], bestMonth }`.
Chaque groupe porte `reliable` (échantillon suffisant ou non). Voir [`ANALYTICS.md`](ANALYTICS.md).

### `GET /api/searches/:id/events?limit=200` → `{ events: [...] }`

`price_events` dérivés, le plus récent d'abord :
`{ id, flightOfferId, type, previousPriceEurCents, newPriceEurCents, dropAmountEurCents, dropPct, confirmed, detectedAt, resolvedAt, durationSeconds }`.

### `GET /api/searches/:id/notifications?limit=200` → `{ notifications: [...] }`

Historique des notifications diffusées, le plus récent d'abord :
`{ id, alertId, priceEventId, channel, status, subject, body, dedupeKey, createdAt, sentAt, error }`.

### `GET /api/searches/:id/provider-requests?limit=200&provider=<name>` → `{ providerRequests: [...] }`

Journal des appels providers émis par le worker pour cette recherche (succès **ou** échec), le plus récent d'abord :
`{ id, provider, ok, offerCount, latencyMs, errorCode, errorMessage, createdAt }`.
`provider` filtre optionnel (`fast-flights`, `mock`, …). Voir [`FLIGHT_PROVIDERS.md`](FLIGHT_PROVIDERS.md).

### `GET /api/notifications/channels` → `{ channels, timeoutMs, maxAttempts }`

État des canaux de notification configurés côté worker (Phase 8) — **aucun secret exposé** :
`channels: { name: "CONSOLE" | "TELEGRAM" | "EMAIL" | "WEBHOOK", configured: boolean }[]`.
`CONSOLE` est toujours `configured`. Sert au dashboard `/settings`. Voir [`NOTIFICATIONS.md`](NOTIFICATIONS.md).

## Alertes

| Route                                                                                     | Réponse                                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `POST /api/alerts` — `{ searchId, type, thresholdEurCents?, enabled?, cooldownSeconds? }` | `201` `AlertDto` ; `400` invalide ; `404` recherche inconnue |
| `GET /api/alerts?searchId=<uuid>`                                                         | `{ alerts: AlertDto[] }`                                     |
| `POST /api/alerts/:id/enable` \| `/disable`                                               | `AlertDto` \| `404`                                          |
| `DELETE /api/alerts/:id`                                                                  | `204` \| `404`                                               |

`type` ∈ `TARGET_PRICE` \| `PRICE_DROP` \| `FLASH_DROP` \| `RECORD_LOW` \| `UNUSUAL_PRICE`.
`AlertDto` : `{ id, searchId, type, thresholdEurCents, enabled, cooldownSeconds, lastTriggeredAt, createdAt }`.

## `SearchDto`

```jsonc
{
  "id", "label", "origin", "destinations", "cabinClass",
  "departureWindow": { "start", "end" },
  "tripDuration": { "minDays", "maxDays" },
  "maxStops", "maxPriceCents", "targetPriceCents", "currency",
  "preferredAirlines", "excludedAirlines",
  "status", "priority", "intervalSeconds",
  "nextRunAt", "lastRunAt", "createdAt"
}
```

## Erreurs

`AppError` → `400 { error: <code>, message }`. Toute autre exception → `500 { error: "INTERNAL" }` (détail logué, jamais renvoyé).
