import { type Cents, type CurrencyCode, type Money } from "@fbr/shared";
import { z } from "zod";

export type { Money } from "@fbr/shared";

/**
 * Montant monétaire dans une offre : **centimes entiers** + code devise ISO 4217.
 * Les providers convertissent leurs formats vers ce modèle (Phase 0 §27).
 */
export const moneySchema = z
  .object({
    amount: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/, "code devise ISO 4217"),
  })
  .transform(({ amount, currency }): Money => ({
    amount: amount as Cents,
    currency: currency as CurrencyCode,
  }));
