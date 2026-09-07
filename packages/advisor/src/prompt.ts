import { summarizeAdvice } from "./rules.js";
import { type AdvisorInput, type LlmPrompt } from "./types.js";

const SYSTEM = [
  "Tu es un conseiller d'achat de billets d'avion. Tu ne disposes QUE des FAITS fournis.",
  "",
  "Règles absolues :",
  "- N'invente AUCUN chiffre : prix, pourcentage, date, score, nombre de jours.",
  "- N'utilise QUE des valeurs présentes dans les FAITS. Si une information manque, dis-le.",
  "- Exprime les prix avec le symbole € (ex. « 1 240 € »), les variations avec % , les dates au format AAAA-MM-JJ.",
  "- N'évoque ni compagnie, ni promotion, ni évènement qui ne figure pas dans les FAITS.",
  "- Pas de garantie sur l'évolution future des prix : reste prudent.",
  "",
  "Format : 3 à 5 phrases, en français, ton direct et actionnable. Commence par l'action recommandée.",
].join("\n");

/** Délimiteurs du bloc de faits — stables, exploités par `MockLlmClient`. */
export const FACTS_OPEN = "<<<FACTS_JSON";
export const FACTS_CLOSE = "FACTS_JSON>>>";

/**
 * Construit le prompt (système + utilisateur). Le message utilisateur contient
 * les FAITS en JSON (entre délimiteurs) et l'action déjà décidée par les règles
 * déterministes — le modèle rédige, il ne recalcule pas.
 */
export const buildAdvisorPrompt = (input: AdvisorInput): LlmPrompt => {
  const rule = summarizeAdvice(input);
  const user = [
    `ACTION_RECOMMANDEE: ${rule.action}`,
    "",
    "FAITS (centimes d'euro) :",
    FACTS_OPEN,
    JSON.stringify(input),
    FACTS_CLOSE,
    "",
    "Rédige le conseil correspondant à ACTION_RECOMMANDEE en t'appuyant sur ces FAITS uniquement.",
  ].join("\n");
  return { system: SYSTEM, user };
};

/** Extrait les FAITS d'un prompt construit par `buildAdvisorPrompt`. */
export const parseFactsFromPrompt = (userMessage: string): AdvisorInput => {
  const start = userMessage.indexOf(FACTS_OPEN);
  const end = userMessage.indexOf(FACTS_CLOSE);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("prompt advisor : bloc FAITS introuvable");
  }
  const json = userMessage.slice(start + FACTS_OPEN.length, end).trim();
  return JSON.parse(json) as AdvisorInput;
};
