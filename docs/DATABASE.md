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

## État du schéma — Phase 3

`0000` : `app_meta` (table technique de bout-en-bout).
`0001` : moteur de recherche + seed de l'utilisateur de dev (`00000000-…-0001` / `dev@localhost`).

| Table                      | Rôle                                                                                                              | Points clés                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `users`                    | Utilisateur (auth réelle en Phase 6)                                                                              | `email` unique                                                                                                |
| `searches`                 | Recherche sauvegardée : origine, destinations[], cabine, fenêtre de dates, durée min/max, budget/cible (centimes) | `status` (ACTIVE/PAUSED/ARCHIVED), `priority`, `interval_seconds`, `next_run_at`                              |
| `search_date_combinations` | Couples (départ, retour) matérialisés et priorisés pour une recherche                                             | unique `(search_id, outbound_date, return_date)`, `priority_score`, `last_checked_at`                         |
| `flight_offers`            | Identité normalisée d'une offre + `payload` JSON complet                                                          | `fingerprint` unique (dédup / clé de l'historique)                                                            |
| `offer_provider_links`     | Une offre vue par plusieurs providers (URL de réservation)                                                        | unique `(flight_offer_id, provider)`                                                                          |
| **`price_snapshots`**      | **Append-only** : une ligne par observation de prix                                                               | `bigserial` id, index `(flight_offer_id, observed_at)` et `(search_id, observed_at)` ; jamais d'UPDATE/DELETE |

**Argent** : colonnes `*_cents` en `integer` (exact, jamais de flottant). **Temps** : `timestamptz` UTC.
`price_snapshots.price_eur_cents` + partitionnement mensuel : ajoutés en **Phase 4** (avec le FX).

## Tables à venir

| Phase | Tables                                                                        |
| ----- | ----------------------------------------------------------------------------- |
| 4     | `price_events`, `fx_rates`, `provider_requests` ; partition `price_snapshots` |
| 5     | `alerts`, `notifications` (avec `dedupe_key` anti-spam)                       |
| 9     | `airports`, `airlines` (référentiels pour le mode Radar)                      |

Chaque phase ajoute ses tables dans `packages/database/src/schema/*.table.ts` + une migration dédiée. Aucune migration appliquée n'est éditée après coup.
