import { describe, expect, it, vi } from "vitest";
import { generateAdvice } from "./advisor.js";
import { MockLlmClient } from "./mock-client.js";
import { AnthropicLlmClient } from "./anthropic-client.js";
import { parseFactsFromPrompt } from "./prompt.js";
import { renderRuleAdvice, summarizeAdvice } from "./rules.js";
import { richInput, thinInput } from "./fixtures.js";
import { type LlmClient } from "./types.js";

const fixed = (text: string, name = "fake"): LlmClient => ({
  name,
  complete: () => Promise.resolve(text),
});

describe("generateAdvice", () => {
  it("MockLlmClient : verdict OK, pas de repli, texte = règles", async () => {
    const input = richInput();
    const res = await generateAdvice(input, { llm: new MockLlmClient() });
    expect(res.verdict).toBe("OK");
    expect(res.fallback).toBe(false);
    expect(res.model).toBe("rules");
    expect(res.action).toBe("ACHETE_MAINTENANT");
    expect(res.text).toBe(renderRuleAdvice(summarizeAdvice(input)));
  });

  it("réponse LLM propre ⇒ conservée, verdict OK", async () => {
    const input = richInput();
    const clean =
      "Achète maintenant : dernier prix 1 180 €, sous la médiane de 1 420 € et sous ta cible de 1 300 €. " +
      "Score 78/100, tendance à la baisse de 8 %. Départ dans 40 jours, peu de marge d'attente.";
    const res = await generateAdvice(input, { llm: fixed(clean, "claude-sonnet-5") });
    expect(res.verdict).toBe("OK");
    expect(res.fallback).toBe(false);
    expect(res.model).toBe("claude-sonnet-5");
    expect(res.text).toBe(clean);
  });

  it("réponse LLM avec valeur inventée ⇒ repli déterministe, verdict FLAGGED", async () => {
    const input = richInput();
    const naughty =
      "Le prix devrait chuter à 750 € d'ici le 2027-02-01 grâce à une promo Air France.";
    const res = await generateAdvice(input, { llm: fixed(naughty) });
    expect(res.verdict).toBe("FLAGGED");
    expect(res.fallback).toBe(true);
    expect(res.model).toBe("rules");
    expect(res.flagged.length).toBeGreaterThan(0);
    // le texte rendu ne contient AUCUNE des valeurs inventées
    expect(res.text).not.toMatch(/750\s?€/);
    expect(res.text).not.toContain("2027-02-01");
    expect(res.text).toBe(renderRuleAdvice(summarizeAdvice(input)));
  });

  it("strict:false ⇒ garde le texte fautif mais le marque FLAGGED", async () => {
    const res = await generateAdvice(richInput(), {
      llm: fixed("Vise 640 € pour ce vol."),
      strict: false,
    });
    expect(res.verdict).toBe("FLAGGED");
    expect(res.fallback).toBe(false);
    expect(res.text).toContain("640");
  });

  it("panne LLM ⇒ repli déterministe, verdict OK", async () => {
    const boom: LlmClient = {
      name: "claude-sonnet-5",
      complete: () => Promise.reject(new Error("503")),
    };
    const res = await generateAdvice(richInput(), { llm: boom });
    expect(res.fallback).toBe(true);
    expect(res.verdict).toBe("OK");
    expect(res.model).toBe("rules");
  });

  it("réponse vide ⇒ repli déterministe", async () => {
    const res = await generateAdvice(thinInput(), { llm: fixed("   ") });
    expect(res.fallback).toBe(true);
    expect(res.action).toBe("COLLECTE");
  });
});

describe("AnthropicLlmClient", () => {
  it("construit la requête Messages et extrait le texte", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
      json: () => Promise.resolve({ content: [{ type: "text", text: "Conseil du modèle." }] }),
    });
    const client = new AnthropicLlmClient({
      apiKey: "sk-test",
      model: "claude-sonnet-5",
      fetchImpl,
    });
    const out = await client.complete({ system: "S", user: "U" });
    expect(out).toBe("Conseil du modèle.");
    const call = fetchImpl.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(call[0]).toBe("https://api.anthropic.com/v1/messages");
    expect(call[1].headers["x-api-key"]).toBe("sk-test");
    expect(call[1].headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(call[1].body) as { model: string; system: string; messages: unknown[] };
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.system).toBe("S");
  });

  it("HTTP non-2xx ⇒ erreur explicite", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("rate limited"),
      json: () => Promise.resolve({}),
    });
    const client = new AnthropicLlmClient({ apiKey: "k", model: "m", fetchImpl });
    await expect(client.complete({ system: "s", user: "u" })).rejects.toThrow(/429/);
  });
});

describe("parseFactsFromPrompt", () => {
  it("récupère exactement les faits encodés (round-trip)", async () => {
    const input = richInput();
    const { buildAdvisorPrompt } = await import("./prompt.js");
    expect(parseFactsFromPrompt(buildAdvisorPrompt(input).user)).toEqual(input);
  });
});
