# Frontend (`apps/web`)

Next.js 15 (App Router) + TypeScript strict + Tailwind v4 + TanStack Query + Recharts.
Découplé de l'API par **HTTP uniquement** (aucun import `@fbr/*`).

**Thème** : tokens CSS dans `app/globals.css` — palette claire sur `:root`, variante
sombre sous `@media (prefers-color-scheme: dark)` (bascule auto selon l'OS, pas de
switch manuel). Tout le style référence ces variables via `bg-[var(--color-…)]`.
Primitives partagées dans `components/ui.tsx` : `Button` (variantes + tailles),
`Card` (+ `interactive`), `PageHeader`, `Stat`, `Badge`, `Input`/`Select`/`Field`,
`Spinner`/`Skeleton`/`EmptyState`/`ErrorState`.

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

| Route            | Contenu                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`     | Cartes de recherche (meilleur prix + **picto ↑/↓/→** d'évolution, 3 moins chers avec badge cabine, cible, priorité ; **rafraîchissement auto 60 s**) + flux « Dernières baisses » + **graphique d'activité** en courbe (30 j)                                                                                                                                 |
| `/searches`      | Tableau (tri par **priorité**, sélecteur Élevée/Moyenne/Basse par ligne) + formulaire de création (**autocomplétion aéroport** avec **drapeau**, destinations en chips ; **plus de choix de cabine** — les 3 vols les moins chers, cabine mélangée) + actions avec **toasts** de confirmation                                                                 |
| `/radar`         | **Exploration** : classement des destinations les moins chères (`/recommendations.radar`), sélecteur de recherche radar quand il y en a plusieurs, formulaire « Activer le radar » avec choix **continent** (tous, ou une région → recherche ciblée sur ses villes) + **classe**, liste seed groupée par région avec **drapeaux** (`/api/radar/destinations`) |
| `/searches/[id]` | Résumé analytics, **carte Recommandations** (score d'opportunité + top-3 dates + classement Radar), **carte Conseil** (`/advice` — action + texte FR, badge « réponse recadrée » si le modèle a dérapé), graphique prix/temps, prix moyen par mois, événements, alertes, notifications, vols observés                                                         |
| `/alerts`        | Toutes les alertes (activer / désactiver / supprimer)                                                                                                                                                                                                                                                                                                         |
| `/settings`      | État de l'API, **canaux de notification actifs** (`/api/notifications/channels`), devise de référence, compte (dev)                                                                                                                                                                                                                                           |

Le **mode Radar** (recherche sans destination) a sa page dédiée `/radar` : liste seed
complète par région + classement des destinations les moins chères. Le formulaire de
création classique accepte aussi une liste de destinations vide.

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

`AuthGate` (`components/auth-gate.tsx`) interroge `GET /api/auth/me` : si l'API
exige une session (`SESSION_SECRET` défini) et qu'aucune n'est présente, redirige
vers `/login`. Pages `/login` + `/register` (e-mail + mot de passe), déconnexion
dans la barre de nav. Sans `SESSION_SECRET` côté API, `me` renvoie
`authRequired: false` et l'app fonctionne sans login (utilisateur de dev).

## Tests

`lib/format.test.ts` + `lib/api.test.ts` (fetch mocké) dans le projet Vitest `unit`.
La validité du rendu est garantie par `next build` (type-check + prérendu des routes).
