import { type AllowedValues } from "./facts.js";

export interface GroundingResult {
  readonly ok: boolean;
  /** Sous-chaînes du texte identifiées comme des valeurs hors périmètre. */
  readonly flagged: string[];
}

/** Espaces (normal, insécable, fine insécable) utilisés comme séparateurs de milliers. */
const SEP = "\\s\\u00A0\\u202F";

/** Normalise "1 240", "1 240" (insécable), "1.240" → 1240. */
const toInt = (raw: string): number => {
  const cleaned = raw
    .replace(new RegExp(`[${SEP}]`, "g"), "")
    .replace(/[.,](?=\d{3}\b)/g, "") // séparateur de milliers
    .replace(/,/g, "."); // décimale FR éventuelle
  return Math.round(Number.parseFloat(cleaned));
};

const near = (value: number, allowed: ReadonlySet<number>): boolean =>
  allowed.has(value) || allowed.has(value + 1) || allowed.has(value - 1);

const euroBefore = (): RegExp => new RegExp(`(-?\\d[\\d${SEP}.,]*)\\s*(?:€|EUR\\b)`, "gi");
const euroAfter = (): RegExp => new RegExp(`(?:€|EUR)\\s*(-?\\d[\\d${SEP}.,]*)`, "gi");
const percent = (): RegExp => /(-?\d+(?:[.,]\d+)?)\s*%/g;
const isoDate = (): RegExp => /\b(\d{4}-\d{2}-\d{2})\b/g;
/** Nombre "nu" prix-like : milliers séparés par espace, ou 3 à 6 chiffres. */
const bareNumber = (): RegExp => new RegExp(`(\\d{1,3}(?:[${SEP}]\\d{3})+|\\d{3,6})`, "g");

/**
 * Contrôle de non-invention (Phase 0 §36). Extrait du texte tout montant (`€`),
 * pourcentage (`%`), date ISO et nombre « prix-like », et vérifie que chacun
 * appartient au périmètre des faits. Pur, sans I/O.
 */
export const assertGrounded = (text: string, allowed: AllowedValues): GroundingResult => {
  const flagged: string[] = [];
  const flag = (s: string): void => {
    const t = s.trim();
    if (!flagged.includes(t)) flagged.push(t);
  };

  for (const re of [euroBefore(), euroAfter()]) {
    for (const m of text.matchAll(re)) {
      const n = toInt(m[1]!);
      if (!Number.isNaN(n) && !near(n, allowed.euros)) flag(m[0]);
    }
  }

  for (const m of text.matchAll(percent())) {
    const n = Math.round(Math.abs(Number.parseFloat(m[1]!.replace(",", "."))));
    if (!Number.isNaN(n) && !near(n, allowed.percents)) flag(m[0]);
  }

  for (const m of text.matchAll(isoDate())) {
    if (!allowed.isoDates.has(m[1]!)) flag(m[1]!);
  }

  for (const m of text.matchAll(bareNumber())) {
    const n = toInt(m[1]!);
    if (Number.isNaN(n)) continue;
    if (n >= 2000 && n <= 2099) continue; // année
    if (near(n, allowed.euros) || near(n, allowed.percents) || allowed.counts.has(n)) continue;
    flag(m[1]!);
  }

  return { ok: flagged.length === 0, flagged };
};
