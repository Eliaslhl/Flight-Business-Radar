# Frontend (`apps/web`)

Next.js 15 (App Router) + TypeScript strict + Tailwind v4 + TanStack Query + Recharts.
Découplé de l'API par **HTTP uniquement** (aucun import `@fbr/*`).

## Démarrer

```bash
pnpm --filter @fbr/api dev      # API sur :3001
pnpm --filter @fbr/worker dev   # worker (analyse + alertes)
pnpm --filter @fbr/web dev      # http://localhost:3000
```

Le navigateur appelle `/api/*` en **même origine** ; `next.config.mjs` les proxie vers
`API_INTERNAL_URL` (défaut `http://localhost:3001`). Aucune configuration CORS n'est
donc nécessaire côté API.

## Pages

| Route            | Contenu                                                                                                                                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`     | Cartes de recherche (meilleur prix, cible, priorité) + flux « Dernières baisses détectées »                                                                                                                                                                                                           |
| `/searches`      | Tableau + formulaire de création + actions (analyser / activer / pause / supprimer)                                                                                                                                                                                                                   |
| `/searches/[id]` | Résumé analytics, **carte Recommandations** (score d'opportunité + top-3 dates + classement Radar), **carte Conseil** (`/advice` — action + texte FR, badge « réponse recadrée » si le modèle a dérapé), graphique prix/temps, prix moyen par mois, événements, alertes, notifications, vols observés |
| `/alerts`        | Toutes les alertes (activer / désactiver / supprimer)                                                                                                                                                                                                                                                 |
| `/settings`      | État de l'API, **canaux de notification actifs** (`/api/notifications/channels`), devise de référence, compte (dev)                                                                                                                                                                                   |

Le **mode Radar** (recherche sans destination) est disponible : le formulaire de création
accepte une liste de destinations vide, et le détail d'une recherche Radar affiche le
**classement des destinations** dans la carte Recommandations (Phase 9). Une vue
« exploration » dédiée (page `/radar` avec la liste seed complète) reste à faire.

## Organisation

```
src/
  app/           pages (App Router) + providers (QueryClient)
  components/    ui.tsx (primitives), badges, charts (recharts), formulaires
  lib/           api.ts (client typé), types.ts (DTO miroir), format.ts, query-keys.ts
```

- **`lib/api.ts`** : client `fetch` typé, `ApiError` sur non-2xx, gère `204`.
- **`lib/types.ts`** : types DTO recopiés de l'API (couplage lâche assumé).
- Toutes les pages sont des Client Components utilisant `useQuery` / `useMutation`
  (le produit est temps réel — polling léger, invalidation après mutation).

## Auth

Aucune (Phase 6) : toutes les données appartiennent à l'utilisateur de dev `dev@localhost`.
Auth.js viendra quand l'API exposera l'authentification.

## Tests

`lib/format.test.ts` + `lib/api.test.ts` (fetch mocké) dans le projet Vitest `unit`.
La validité du rendu est garantie par `next build` (type-check + prérendu des 8 routes).
