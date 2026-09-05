# Base de données

- **SGBD** : PostgreSQL 16 (local via `docker compose`).
- **Accès** : [Drizzle ORM](https://orm.drizzle.team) + driver [`postgres.js`](https://github.com/porsager/postgres).
- **Migrations** : SQL versionné dans `packages/database/drizzle/`, généré par `drizzle-kit` et appliqué par `packages/database/src/migrate.ts`.
- **Argent** : colonnes `numeric` (jamais `float`). Côté code : centimes entiers (`@fbr/shared` `Cents`).
- **Temps** : `timestamptz` en UTC.

## Commandes

```bash
pnpm db:generate   # schéma TS -> nouveau fichier de migration SQL
pnpm db:migrate    # applique les migrations en attente à DATABASE_URL (idempotent)
pnpm --filter @fbr/database db:studio   # explorateur Drizzle
```

## État du schéma — Phase 1

Une seule table technique pour valider la chaîne connexion → migration → client typé :

### `app_meta`

| Colonne      | Type          | Notes          |
| ------------ | ------------- | -------------- |
| `key`        | `text`        | PK             |
| `value`      | `text`        | non nul        |
| `updated_at` | `timestamptz` | défaut `now()` |

## Tables à venir (cf. PHASE-0-DISCOVERY.md §5)

| Phase | Tables                                                                                        |
| ----- | --------------------------------------------------------------------------------------------- |
| 3     | `users`, `searches`, `search_date_combinations`, `airports`, `airlines`                       |
| 3–4   | `flight_offers`, `offer_provider_links`, `price_snapshots` (append-only, partition mensuelle) |
| 4     | `price_events`, `fx_rates`, `provider_requests`                                               |
| 5     | `alerts`, `notifications` (avec `dedupe_key` anti-spam)                                       |

Chaque phase ajoute ses tables dans `packages/database/src/schema/` + une migration dédiée. Aucune migration existante n'est éditée après coup.
