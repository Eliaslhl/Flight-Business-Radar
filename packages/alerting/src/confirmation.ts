import { type AlertType } from "./types.js";

/**
 * Types d'alerte pour lesquels un prix exceptionnellement bas doit être
 * **re-vérifié** avant de notifier (Phase 0 §10 — éviter les alertes trompeuses
 * sur un deep-link expiré ou une erreur provider).
 */
export const CONFIRMATION_REQUIRED: ReadonlySet<AlertType> = new Set<AlertType>([
  "FLASH_DROP",
  "RECORD_LOW",
  "UNUSUAL_PRICE",
]);

export const needsConfirmation = (alertType: AlertType): boolean =>
  CONFIRMATION_REQUIRED.has(alertType);

export interface RecheckOffer {
  readonly priceEurCents: number;
  readonly availability: string;
}

const AVAILABLE = new Set(["AVAILABLE", "LOW"]);

/**
 * `true` si la re-requête confirme un prix disponible ≤ `targetEurCents`
 * (avec une tolérance, défaut 3 %).
 */
export const isPriceConfirmed = (
  targetEurCents: number,
  recheck: readonly RecheckOffer[],
  tolerance = 0.03,
): boolean => {
  const ceiling = targetEurCents * (1 + tolerance);
  return recheck.some((o) => AVAILABLE.has(o.availability) && o.priceEurCents <= ceiling);
};
