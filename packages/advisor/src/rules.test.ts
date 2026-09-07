import { describe, expect, it } from "vitest";
import { collectAllowedValues } from "./facts.js";
import { assertGrounded } from "./grounding.js";
import { renderRuleAdvice, summarizeAdvice } from "./rules.js";
import { radarInput, richInput, thinInput } from "./fixtures.js";

describe("summarizeAdvice", () => {
  it("COLLECTE quand l'échantillon est trop maigre", () => {
    const a = summarizeAdvice(thinInput());
    expect(a.action).toBe("COLLECTE");
    expect(a.body).toMatch(/insuffisant|Le radar/i);
  });

  it("ACHETE_MAINTENANT quand la bande est GOOD, sous la cible", () => {
    const a = summarizeAdvice(richInput());
    expect(a.action).toBe("ACHETE_MAINTENANT");
    expect(a.headline).toBe("Achète maintenant");
  });

  it("EXCEPTIONAL ⇒ ACHETE_MAINTENANT", () => {
    const a = summarizeAdvice(
      richInput({ opportunity: { score: 92, band: "EXCEPTIONAL", reasons: [] } }),
    );
    expect(a.action).toBe("ACHETE_MAINTENANT");
  });

  it("FAIR + tendance à la baisse ⇒ ATTENDS", () => {
    const a = summarizeAdvice(
      richInput({
        opportunity: { score: 45, band: "FAIR", reasons: [] },
        trend: { direction: "FALLING", changePct: -0.05 },
        budget: { targetEurCents: null, maxEurCents: null },
      }),
    );
    expect(a.action).toBe("ATTENDS");
  });

  it("POOR ⇒ ATTENDS", () => {
    expect(
      summarizeAdvice(richInput({ opportunity: { score: 20, band: "POOR", reasons: [] } })).action,
    ).toBe("ATTENDS");
  });

  it("le texte des règles est toujours grounded (aucune valeur inventée)", () => {
    for (const input of [richInput(), thinInput(), radarInput()]) {
      const text = renderRuleAdvice(summarizeAdvice(input));
      expect(assertGrounded(text, collectAllowedValues(input))).toEqual({ ok: true, flagged: [] });
    }
  });

  it("mentionne la destination Radar la moins chère", () => {
    const a = summarizeAdvice(radarInput());
    expect(a.body).toMatch(/JFK/);
  });
});
