import { z } from "zod";

/**
 * Dates calendaires au format `YYYY-MM-DD` (sans fuseau) et instants ISO 8601
 * avec offset. Toute la logique métier raisonne sur ces chaînes ; les `Date`
 * ne servent qu'aux calculs internes.
 */
export type IsoDate = string & { readonly __brand: "IsoDate" };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (value: string): value is IsoDate => {
  if (!ISO_DATE_RE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return false;
  // Rejette les dates "normalisées" par le moteur JS (ex. 2026-02-30 -> mars).
  return new Date(time).toISOString().slice(0, 10) === value;
};

export const isoDate = (value: string): IsoDate => {
  if (!isIsoDate(value)) {
    throw new Error(`Date invalide: ${JSON.stringify(value)} (attendu YYYY-MM-DD)`);
  }
  return value;
};

export const isoDateSchema = z.string().refine(isIsoDate, "date invalide (attendu YYYY-MM-DD)");

export const isoDateTimeSchema = z.string().datetime({ offset: true });

/** Différence en jours entiers entre deux dates calendaires (b - a). */
export const daysBetween = (a: IsoDate, b: IsoDate): number => {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
};

/** Ajoute `days` jours à une date calendaire. */
export const addDays = (date: IsoDate, days: number): IsoDate => {
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000);
  return next.toISOString().slice(0, 10) as IsoDate;
};

export const compareIsoDate = (a: IsoDate, b: IsoDate): number => (a < b ? -1 : a > b ? 1 : 0);
