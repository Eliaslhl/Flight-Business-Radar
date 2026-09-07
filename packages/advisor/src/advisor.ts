import { type Logger } from "@fbr/shared";
import { collectAllowedValues } from "./facts.js";
import { assertGrounded } from "./grounding.js";
import { buildAdvisorPrompt } from "./prompt.js";
import { renderRuleAdvice, summarizeAdvice } from "./rules.js";
import { type AdviceResult, type AdvisorInput, type LlmClient } from "./types.js";

export interface GenerateAdviceOptions {
  readonly llm: LlmClient;
  /**
   * `true` (défaut) : si la réponse cite une valeur hors des faits, on la
   * remplace par le résumé déterministe. `false` : on garde le texte mais on
   * le marque `FLAGGED`.
   */
  readonly strict?: boolean;
  readonly logger?: Logger;
}

/**
 * Génère un conseil en langage naturel à partir des FAITS structurés (Phase 0
 * §35–36). Le texte du modèle est **toujours** repassé au contrôle de
 * non-invention ; en cas de panne LLM, repli déterministe.
 */
export const generateAdvice = async (
  input: AdvisorInput,
  options: GenerateAdviceOptions,
): Promise<AdviceResult> => {
  const strict = options.strict ?? true;
  const rule = summarizeAdvice(input);
  const fallbackText = renderRuleAdvice(rule);

  const model = options.llm.name;
  let text: string;
  try {
    text = (await options.llm.complete(buildAdvisorPrompt(input))).trim();
    if (!text) throw new Error("réponse vide");
  } catch (error) {
    options.logger?.warn(
      { event: "advisor_llm_unavailable", err: String(error), advisor: options.llm.name },
      "advisor : LLM indisponible, repli déterministe",
    );
    return {
      text: fallbackText,
      action: rule.action,
      verdict: "OK",
      flagged: [],
      fallback: true,
      model: "rules",
    };
  }

  const grounding = assertGrounded(text, collectAllowedValues(input));
  if (grounding.ok) {
    return { text, action: rule.action, verdict: "OK", flagged: [], fallback: false, model };
  }

  options.logger?.warn(
    { event: "advisor_flagged", advisor: model, flagged: grounding.flagged },
    "advisor : valeurs hors périmètre dans la réponse du modèle",
  );

  if (strict) {
    return {
      text: fallbackText,
      action: rule.action,
      verdict: "FLAGGED",
      flagged: grounding.flagged,
      fallback: true,
      model: "rules",
    };
  }
  return {
    text,
    action: rule.action,
    verdict: "FLAGGED",
    flagged: grounding.flagged,
    fallback: false,
    model,
  };
};
