import { parseFactsFromPrompt } from "./prompt.js";
import { renderRuleAdvice, summarizeAdvice } from "./rules.js";
import { type LlmClient, type LlmPrompt } from "./types.js";

/**
 * Client LLM déterministe : régénère le conseil issu des règles à partir des
 * FAITS encodés dans le prompt. Aucun réseau, aucun secret — générateur par
 * défaut (et le seul en CI). Passe toujours le contrôle de non-invention
 * puisqu'il ne cite que des faits.
 */
export class MockLlmClient implements LlmClient {
  readonly name = "rules";

  complete(prompt: LlmPrompt): Promise<string> {
    const facts = parseFactsFromPrompt(prompt.user);
    return Promise.resolve(renderRuleAdvice(summarizeAdvice(facts)));
  }
}
