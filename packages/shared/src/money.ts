/**
 * Helpers monétaires. Règle projet : les montants sont manipulés en
 * **centimes entiers** (`Cents`) pour éviter les erreurs de flottant, et
 * stockés en `numeric` côté base. La conversion de devise se fait dans la
 * couche provider ; les statistiques n'utilisent qu'une seule devise (EUR).
 */
export type CurrencyCode = string & { readonly __brand: "CurrencyCode" };
export type Cents = number & { readonly __brand: "Cents" };

const CURRENCY_RE = /^[A-Z]{3}$/;

export const isCurrencyCode = (value: string): value is CurrencyCode => CURRENCY_RE.test(value);

export const currencyCode = (value: string): CurrencyCode => {
  const upper = value.toUpperCase();
  if (!isCurrencyCode(upper)) {
    throw new Error(`Code devise invalide: ${JSON.stringify(value)} (attendu ISO 4217, ex. "EUR")`);
  }
  return upper;
};

/** 1486.50 (unités) → 148650 (centimes). Rejette NaN/Infinity. */
export const toCents = (amount: number): Cents => {
  if (!Number.isFinite(amount)) {
    throw new Error(`Montant non fini: ${String(amount)}`);
  }
  return Math.round(amount * 100) as Cents;
};

/** 148650 (centimes) → 1486.5 (unités). */
export const fromCents = (cents: Cents): number => cents / 100;

export interface Money {
  readonly amount: Cents;
  readonly currency: CurrencyCode;
}

export const money = (amount: number, currency: string): Money => ({
  amount: toCents(amount),
  currency: currencyCode(currency),
});

export const formatMoney = (value: Money, locale = "fr-FR"): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency: value.currency }).format(
    fromCents(value.amount),
  );

/** Variation relative entre deux montants (même devise). `from` = référence. */
export const pctChange = (from: Cents, to: Cents): number => {
  if (from === 0) return 0;
  return (to - from) / from;
};
