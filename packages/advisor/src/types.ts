/**
 * Faits structurés remis à l'advisor. **Toute** valeur chiffrée qu'un conseil
 * peut légitimement citer provient d'ici — le contrôle de non-invention
 * (`assertGrounded`) s'appuie exactement sur cet objet.
 */
export interface AdvisorInput {
  readonly route: {
    readonly origin: string;
    readonly destinations: string[];
    readonly radar: boolean;
  };
  readonly window: { readonly start: string; readonly end: string };
  readonly trip: { readonly minDays: number; readonly maxDays: number };
  readonly currency: "EUR";
  readonly budget: {
    readonly targetEurCents: number | null;
    readonly maxEurCents: number | null;
  };
  readonly now: string;
  readonly daysUntilDeparture: number | null;
  readonly observations: number;
  readonly price: {
    readonly latestEurCents: number | null;
    readonly bestEverEurCents: number | null;
    readonly meanEurCents: number | null;
    readonly medianEurCents: number | null;
    readonly p10EurCents: number | null;
    readonly p90EurCents: number | null;
  };
  readonly trend: {
    readonly direction: "RISING" | "FALLING" | "STABLE";
    readonly changePct: number;
  } | null;
  readonly opportunity: {
    readonly score: number | null;
    readonly band: string;
    readonly reasons: string[];
  };
  readonly bestMonth: {
    readonly key: string;
    readonly meanEurCents: number;
    readonly reliable: boolean;
  } | null;
  readonly topDates: {
    readonly outboundDate: string;
    readonly returnDate: string | null;
    readonly latestEurCents: number;
    readonly deltaVsMedianPct: number;
  }[];
  readonly radarTop: {
    readonly destination: string;
    readonly latestEurCents: number;
    readonly bestOutboundDate: string;
  }[];
}

export type AdviceAction =
  | "COLLECTE" // pas assez de données
  | "ACHETE_MAINTENANT"
  | "PRET_A_ACHETER"
  | "SURVEILLE"
  | "ATTENDS";

export type AdviceVerdict = "OK" | "FLAGGED";

export interface AdviceResult {
  /** Texte présenté à l'utilisateur (français). Recadré sur les faits si le modèle a dérapé. */
  readonly text: string;
  readonly action: AdviceAction;
  /** `OK` si le texte ne cite que des valeurs des faits ; `FLAGGED` sinon. */
  readonly verdict: AdviceVerdict;
  /** Valeurs hors périmètre repérées dans la réponse du modèle. */
  readonly flagged: string[];
  /** `true` si le texte a été remplacé par le résumé déterministe. */
  readonly fallback: boolean;
  /** Identifiant du générateur (`rules`, `claude-sonnet-5`, …). */
  readonly model: string;
}

export interface LlmPrompt {
  readonly system: string;
  readonly user: string;
}

/** Client LLM abstrait — une implémentation déterministe (`MockLlmClient`) et
 * une réelle (`AnthropicLlmClient`). L'advisor ne connaît que cette interface. */
export interface LlmClient {
  readonly name: string;
  complete(prompt: LlmPrompt): Promise<string>;
}
