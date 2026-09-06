# flight-scraper (sidecar)

Isole `fast-flights` (scraping Google Flights) derrière un contrat HTTP stable
consommé par `@fbr/flight-providers` → `FastFlightsProvider`.

## Modes (`FLIGHT_SCRAPER_MODE`)

| Mode               | Comportement                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixture` (défaut) | Rejoue `fixtures/<ORIGIN>-<DEST>.json` (ou `fixtures/default.json`) avec les dates de la requête + jitter déterministe. **Toujours fonctionnel, hors ligne.** |
| `live`             | Tente `fast-flights`. **Best-effort** : tout échec renvoie `{ offers: [], degraded: true, error }` en HTTP 200 (la chaîne en amont n'est jamais interrompue). |

> `fast-flights` en mode `live` est **fragile** : le scraping direct de Google Flights
> est régulièrement cassé par des changements de page / anti-bot (cf.
> `docs/FLIGHT_PROVIDERS.md`). Le design permet de basculer vers une intégration
> payante (SerpApi, BrightData) ou un autre provider sans toucher au pipeline.

## Lancer

```bash
# via Docker (profil dédié — non démarré par `docker compose up`)
docker compose --profile scraper up -d flight-scraper   # http://localhost:8000

# ou en local
cd services/flight-scraper
python -m venv .venv && .venv/bin/pip install -r requirements.txt
FLIGHT_SCRAPER_MODE=fixture .venv/bin/uvicorn main:app --port 8000
```

Puis côté worker : `FAST_FLIGHTS_URL=http://localhost:8000`.

## Contrat

`POST /search`

```jsonc
{
  "origin": "CDG",
  "destination": "HND",
  "outboundDate": "2026-11-10",
  "returnDate": "2026-11-20",
  "cabinClass": "business",
  "currency": "EUR",
  "maxStops": 1,
  "passengers": 1,
}
```

→

```jsonc
{ "provider": "fast-flights", "mode": "fixture", "degraded": false, "currency": "EUR",
  "fetchedAt": "…Z", "error": null,
  "offers": [ { "priceCents": 138900, "currency": "EUR", "totalStops": 0, "isBest": true,
    "bookingUrl": null,
    "outbound": { "airlineName": "Air France", "airlineCode": "AF", "flightNumbers": ["AF276"],
      "departureAt": "…", "arrivalAt": "…", "durationMinutes": 705, "stops": 0,
      "fromCode": "CDG", "toCode": "HND" },
    "inbound": { … } } ] }
```
