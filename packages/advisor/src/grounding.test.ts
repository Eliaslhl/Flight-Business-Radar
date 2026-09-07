import { describe, expect, it } from "vitest";
import { collectAllowedValues } from "./facts.js";
import { assertGrounded } from "./grounding.js";
import { richInput } from "./fixtures.js";

// richInput : prix en centimes → euros affichés : latest 1 180 €, médiane 1 420 €,
// plus bas 1 120 €, p10 1 210 €, cible 1 300 €. changePct -8 %.
const allowed = collectAllowedValues(richInput());

describe("assertGrounded", () => {
  it("accepte un texte qui ne cite que des valeurs des faits", () => {
    const text =
      "Achète maintenant. Dernier prix 1 180 €, médiane 1 420 €, plus bas 1 120 €. " +
      "Score 78/100, tendance à la baisse (8 %). Meilleure date 2026-11-17 à 1 180 €.";
    expect(assertGrounded(text, allowed)).toEqual({ ok: true, flagged: [] });
  });

  it("repère un prix inventé", () => {
    const r = assertGrounded("Le prix va tomber à 950 € la semaine prochaine.", allowed);
    expect(r.ok).toBe(false);
    expect(r.flagged.join(" ")).toMatch(/950/);
  });

  it("repère un pourcentage inventé", () => {
    const r = assertGrounded("Tu peux espérer -42 % dans les prochains jours.", allowed);
    expect(r.ok).toBe(false);
    expect(r.flagged).toContain("-42 %");
  });

  it("repère une date hors périmètre", () => {
    const r = assertGrounded("Réserve avant le 2027-01-15.", allowed);
    expect(r.ok).toBe(false);
    expect(r.flagged).toContain("2027-01-15");
  });

  it("tolère l'arrondi d'affichage (±1 €/%)", () => {
    expect(assertGrounded("Médiane autour de 1 419 €.", allowed).ok).toBe(true);
  });

  it("n'assimile pas une année à un prix inventé", () => {
    expect(assertGrounded("En 2026, la fenêtre part du 2026-11-10.", allowed).ok).toBe(true);
  });

  it("repère un nombre nu de type prix hors périmètre", () => {
    const r = assertGrounded("Vise plutôt 8 750 pour ce vol.", allowed);
    expect(r.ok).toBe(false);
    expect(r.flagged).toContain("8 750");
  });
});
