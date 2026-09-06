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
`{ id, flightOfferId, provider, priceCents, currency, availability, status, observedAt }`.

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
