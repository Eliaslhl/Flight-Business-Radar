import { type AdviceAction, type AdvisorInput } from "./types.js";

export interface RuleAdvice {
  readonly action: AdviceAction;
  readonly headline: string;
  readonly body: string;
}

/** Échantillon minimal pour émettre un vrai conseil (sinon on collecte). */
export const ADVICE_MIN_SAMPLE = 20;

const eur = (cents: number | null): string =>
  cents === null ? "?" : `${Math.round(cents / 100).toLocaleString("fr-FR")} €`;

const pct = (frac: number): string => `${Math.round(Math.abs(frac) * 100)} %`;

const ACTION_HEADLINE: Record<AdviceAction, string> = {
  COLLECTE: "Encore trop tôt",
  ACHETE_MAINTENANT: "Achète maintenant",
  PRET_A_ACHETER: "Bon moment pour acheter",
  SURVEILLE: "Surveille de près",
  ATTENDS: "Attends",
};

const decideAction = (input: AdvisorInput): AdviceAction => {
  if (input.observations < ADVICE_MIN_SAMPLE || input.opportunity.score === null) return "COLLECTE";
  const band = input.opportunity.band;
  const rising = input.trend?.direction === "RISING";
  const falling = input.trend?.direction === "FALLING";
  const underTarget =
    input.budget.targetEurCents !== null &&
    input.price.latestEurCents !== null &&
    input.price.latestEurCents <= input.budget.targetEurCents;

  if (band === "EXCEPTIONAL" || (band === "GOOD" && (rising || underTarget))) {
    return "ACHETE_MAINTENANT";
  }
  if (band === "GOOD") return "PRET_A_ACHETER";
  if (band === "FAIR") return falling ? "ATTENDS" : "SURVEILLE";
  return "ATTENDS";
};

/**
 * Conseil **déterministe** dérivé uniquement des faits. Sert de contenu au
 * `MockLlmClient` et de repli quand la réponse du modèle réel dérape.
 * N'utilise jamais de valeur absente de `input`.
 */
export const summarizeAdvice = (input: AdvisorInput): RuleAdvice => {
  const action = decideAction(input);
  const headline = ACTION_HEADLINE[action];
  const dest = input.route.radar ? "toutes destinations" : input.route.destinations.join(", ");
  const routeLabel = `${input.route.origin} → ${dest}`;

  if (action === "COLLECTE") {
    return {
      action,
      headline,
      body:
        `${routeLabel} : seulement ${String(input.observations)} observations de prix pour l'instant, ` +
        `c'est insuffisant pour un conseil fiable. Le radar continue de collecter — reviens quand l'historique sera étoffé.`,
    };
  }

  const parts: string[] = [];
  parts.push(
    `${routeLabel} : dernier prix observé ${eur(input.price.latestEurCents)}, ` +
      `médiane historique ${eur(input.price.medianEurCents)} ` +
      `(plus bas jamais vu ${eur(input.price.bestEverEurCents)}).`,
  );
  parts.push(
    `Score d'opportunité ${String(input.opportunity.score)}/100 (${input.opportunity.band.toLowerCase()})` +
      (input.trend
        ? input.trend.direction === "FALLING"
          ? `, tendance à la baisse (${pct(input.trend.changePct)}).`
          : input.trend.direction === "RISING"
            ? `, tendance à la hausse (${pct(input.trend.changePct)}).`
            : ", tendance stable."
        : "."),
  );

  if (input.daysUntilDeparture !== null) {
    parts.push(`Départ dans ${String(input.daysUntilDeparture)} jours.`);
  }

  const cheapest = input.topDates[0];
  if (cheapest) {
    parts.push(
      `Meilleure date repérée : ${cheapest.outboundDate}` +
        (cheapest.returnDate ? ` → ${cheapest.returnDate}` : "") +
        ` à ${eur(cheapest.latestEurCents)}.`,
    );
  }
  const radarBest = input.radarTop[0];
  if (input.route.radar && radarBest) {
    parts.push(
      `Destination la moins chère en ce moment : ${radarBest.destination} ` +
        `à ${eur(radarBest.latestEurCents)} (départ ${radarBest.bestOutboundDate}).`,
    );
  }

  const verdict: Record<Exclude<AdviceAction, "COLLECTE">, string> = {
    ACHETE_MAINTENANT: "C'est un très bon prix : réserve sans attendre.",
    PRET_A_ACHETER: "Le prix est favorable ; réserve si les dates te conviennent.",
    SURVEILLE: "Prix correct sans plus — mets une alerte et attends une vraie baisse.",
    ATTENDS: "Rien d'intéressant pour l'instant — laisse le radar travailler.",
  };
  parts.push(verdict[action]);

  return { action, headline, body: parts.join(" ") };
};

/** Rendu texte du conseil déterministe (repli / mock). */
export const renderRuleAdvice = (advice: RuleAdvice): string =>
  `${advice.headline}. ${advice.body}`;
