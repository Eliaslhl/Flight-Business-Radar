/**
 * Eval de l'advisor (Phase 0 §36 — « ne cite que des données du système »).
 *
 * On confronte plusieurs scénarios de faits à :
 *  - un modèle honnête (paraphrase fidèle) → doit passer `OK`, sans repli ;
 *  - une batterie de modèles « malicieux » qui glissent des valeurs inventées
 *    (prix, %, date, nombre nu) → doivent TOUS être rattrapés (`FLAGGED` +
 *    repli), et le texte rendu ne doit contenir aucune valeur inventée.
 */
import { describe, expect, it } from "vitest";
import { generateAdvice } from "./advisor.js";
import { MockLlmClient } from "./mock-client.js";
import { renderRuleAdvice, summarizeAdvice } from "./rules.js";
import { radarInput, richInput, thinInput } from "./fixtures.js";
import { type AdvisorInput, type LlmClient } from "./types.js";

const SCENARIOS: { name: string; input: AdvisorInput; expectedAction: string }[] = [
  { name: "historique riche, bon prix", input: richInput(), expectedAction: "ACHETE_MAINTENANT" },
  { name: "historique maigre", input: thinInput(), expectedAction: "COLLECTE" },
  { name: "mode radar", input: radarInput(), expectedAction: "ACHETE_MAINTENANT" },
  {
    name: "prix élevé, bande POOR",
    input: richInput({ opportunity: { score: 22, band: "POOR", reasons: [] } }),
    expectedAction: "ATTENDS",
  },
];

const INJECTIONS = [
  "Bonus : le prix devrait tomber à 640 € la semaine prochaine.",
  "Attends-toi à -55 % d'ici peu.",
  "Vol repéré le 2099-12-31, à saisir.",
  "Cible réaliste : 9 999 pour ce trajet.",
  "Air France casse les prix à 1 000 000 € cette nuit.",
];

const fixed = (text: string): LlmClient => ({
  name: "adversaire",
  complete: () => Promise.resolve(text),
});

describe("advisor — eval anti-invention", () => {
  it.each(SCENARIOS)(
    "$name : le modèle honnête passe OK sans repli",
    async ({ input, expectedAction }) => {
      const res = await generateAdvice(input, { llm: new MockLlmClient() });
      expect(res.verdict).toBe("OK");
      expect(res.fallback).toBe(false);
      expect(res.action).toBe(expectedAction);
    },
  );

  it.each(SCENARIOS)(
    "$name : toute injection est rattrapée (FLAGGED + repli propre)",
    async ({ input }) => {
      const honest = renderRuleAdvice(summarizeAdvice(input));
      for (const inj of INJECTIONS) {
        const res = await generateAdvice(input, { llm: fixed(`${honest} ${inj}`) });
        expect(res.verdict).toBe("FLAGGED");
        expect(res.fallback).toBe(true);
        expect(res.flagged.length).toBeGreaterThan(0);
        // aucune trace des valeurs inventées dans ce qui est rendu
        expect(res.text).not.toMatch(/640|9\s?999|1\s?000\s?000|2099-12-31|55\s?%/);
        expect(res.text).toBe(honest);
      }
    },
  );

  it("un modèle qui ne fait que reformuler fidèlement passe OK", async () => {
    const input = richInput();
    const honest = renderRuleAdvice(summarizeAdvice(input));
    const paraphrase = `En résumé : ${honest}`;
    const res = await generateAdvice(input, { llm: fixed(paraphrase) });
    expect(res.verdict).toBe("OK");
    expect(res.text).toBe(paraphrase);
  });
});
