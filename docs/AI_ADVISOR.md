# AI Advisor (Phase 10)

> Cf. `PHASE-0-DISCOVERY.md` §35–36 — « stats structurées en entrée → recommandation en
> langage naturel en sortie, garde-fous anti-invention + eval ; ne cite que des données du
> système ».

`@fbr/advisor` transforme les **faits déjà calculés** (rapport analytics + rapport de
recommandations d'une recherche) en un **conseil en français**. Sans clé API, tout
fonctionne : le générateur par défaut est déterministe.

## Chaîne

```
buildAdvisorInput(search, analytics, recommendation)   → AdvisorInput   (faits minimaux, centimes EUR)
        │
buildAdvisorPrompt(input)                              → { system, user }   (règles anti-invention + FAITS JSON)
        │
llm.complete(prompt)                                   → texte brut
        │
assertGrounded(texte, collectAllowedValues(input))     → { ok, flagged[] }
        │
  ok            → conseil du modèle, verdict OK
  flagged (strict) → repli sur summarizeAdvice(input), verdict FLAGGED
  panne LLM     → repli sur summarizeAdvice(input), verdict OK
```

## Garde-fou anti-invention — `assertGrounded`

Pur. Extrait du texte **tout** :

- montant marqué `€` / `EUR` ;
- pourcentage marqué `%` ;
- date `AAAA-MM-JJ` ;
- nombre « nu » de type prix (3–6 chiffres ou milliers espacés), hors année 2000–2099 ;

et vérifie que chaque valeur appartient au périmètre `AllowedValues` dérivé **exactement**
des faits (`collectAllowedValues`) : euros arrondis (± 1 pour l'arrondi d'affichage),
pourcentages en valeur absolue (± 1), petits comptes (jours, score, `/100`, durées),
dates ISO des faits. Toute valeur hors périmètre est `flagged`.

> Le générateur `rules` ne cite par construction que des faits — il passe toujours.
> C'est la sortie d'un LLM réel qui est contrôlée.

## Générateurs

| Générateur           | `model`         | Quand                                                                 |
| -------------------- | --------------- | --------------------------------------------------------------------- |
| `MockLlmClient`      | `rules`         | défaut, CI, hors-ligne — reformule `summarizeAdvice`                  |
| `AnthropicLlmClient` | `ADVISOR_MODEL` | si `ANTHROPIC_API_KEY` défini — API Messages (fetch brut, pas de SDK) |

`summarizeAdvice(input)` (règles pures) choisit une **action** (`COLLECTE` /
`ACHETE_MAINTENANT` / `PRET_A_ACHETER` / `SURVEILLE` / `ATTENDS`) à partir de la bande
d'opportunité, de la tendance, de la proximité de la cible et du délai avant départ, puis
rédige un paragraphe **ne citant que des faits**. C'est aussi le **repli** si le modèle
réel dérape ou tombe. L'`action` renvoyée est toujours celle des règles (jamais celle du
modèle) — le LLM ne fait que rédiger.

## API

`GET /api/searches/:id/advice` → `{ text, action, verdict, flagged[], fallback, model, facts, generatedAt }`
(`404` si la recherche est inconnue). `facts` est l'`AdvisorInput` exact — ce que le modèle
a vu.

## Config (`.env`)

| Variable             | Défaut            | Rôle                                                                   |
| -------------------- | ----------------- | ---------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | _(vide)_          | Active `AnthropicLlmClient` (sinon `rules`). Secret — jamais committé. |
| `ADVISOR_MODEL`      | `claude-sonnet-5` | Modèle Claude utilisé quand la clé est présente                        |
| `ADVISOR_MAX_TOKENS` | 600               | Plafond de génération                                                  |
| `ADVISOR_TIMEOUT_MS` | 20000             | Timeout par appel au modèle                                            |

## Eval

`packages/advisor/src/eval.test.ts` : plusieurs scénarios de faits × une batterie de
modèles « adversaires » qui injectent des prix, %, dates et nombres inventés. Attendu :
tout est rattrapé (`FLAGGED` + repli), et le texte rendu ne contient **aucune** valeur
inventée. Un modèle qui se contente de reformuler fidèlement passe `OK`. Fait partie de
`pnpm test`.
