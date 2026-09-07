# Développement

## Mise en place

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d          # PostgreSQL + Redis
pnpm db:migrate
```

## Boucle de travail

| Besoin                      | Commande                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tout vérifier (comme la CI) | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm test`                                                                        |
| Tests en watch              | `pnpm test:watch`                                                                                                                                    |
| Tests d'un seul package     | `pnpm --filter @fbr/shared test`                                                                                                                     |
| API en dev (reload)         | `pnpm --filter @fbr/api dev` → `GET http://localhost:3001/health`                                                                                    |
| Worker en dev               | `pnpm --filter @fbr/worker dev`                                                                                                                      |
| Dashboard en dev            | `pnpm --filter @fbr/web dev` → `http://localhost:3000`                                                                                               |
| Sidecar vols réels (opt.)   | `docker compose --profile scraper up -d flight-scraper` + `FAST_FLIGHTS_URL=http://localhost:8000` dans `.env`                                       |
| Canaux de notif. en local   | `docker run -p 1025:1025 -p 8025:8025 mailhog/mailhog` (email) ; `NOTIFICATION_WEBHOOK_URL=…` (webhook). Voir [`NOTIFICATIONS.md`](NOTIFICATIONS.md) |
| Corriger le formatage       | `pnpm format`                                                                                                                                        |
| Corriger le lint            | `pnpm lint:fix`                                                                                                                                      |

## Règles par phase

À la fin de **chaque** phase :

1. expliquer ce qui est construit ;
2. implémenter ;
3. écrire les tests ;
4. exécuter les tests (`pnpm test`) ;
5. corriger jusqu'au vert ;
6. mettre à jour la doc concernée ;
7. vérifier la non-régression (`pnpm typecheck && pnpm lint && pnpm build && pnpm test`) ;
8. résumer ;
9. proposer l'étape suivante.

> Le code qui compile ≠ fonctionnalité terminée. L'app doit être exécutable et testable.

## Conventions

- **Modules** : ESM, `moduleResolution: NodeNext`, imports relatifs suffixés `.js`.
- **Imports de types** : `import { type Foo }` ou `import type { Foo }` (règle ESLint `consistent-type-imports`).
- **Config** : lire la configuration via `@fbr/config` uniquement — jamais `process.env` ailleurs.
- **Logs** : `createLogger({ name })` + `logger.info({ event: LogEvent.X, ... }, "msg")`. Aucun secret dans les logs (redaction en place, mais rester vigilant).
- **Erreurs** : lever une sous-classe d'`AppError` avec un `code` et `retryable` correct.
- **Argent** : `@fbr/shared` `toCents` / `fromCents` ; ne jamais additionner des nombres flottants de prix.
- **Tests** : deux projets Vitest.
  - `*.test.ts` (unit) : co-localisés, aucune dépendance réseau, exécutés en parallèle.
  - `*.int.test.ts` (integration) : Postgres + Redis, exécutés **en série** (base partagée + verrou consultatif). Ils se **skippent** automatiquement si `DATABASE_URL` / `REDIS_URL` sont absents ; sinon `docker compose up -d` suffit (le `.env` est chargé automatiquement).

## Git

- Branche par défaut : `main`. Travailler sur des branches `phase-N-*` ou `feat/*`.
- Ne jamais committer `.env` ni une clé d'API.
