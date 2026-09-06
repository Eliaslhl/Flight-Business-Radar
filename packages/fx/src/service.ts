import { AppError } from "@fbr/shared";
import { type FxProvider, type RateStore } from "./types.js";

export interface FxServiceOptions {
  readonly provider: FxProvider;
  readonly store: RateStore;
  /** Devise de référence des statistiques (Phase 0 §28). */
  readonly base: string;
  readonly now?: () => Date;
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Convertit des montants vers la devise de référence. Ne récupère jamais que des
 * taux `base → X` (via le provider), les met en cache (`RateStore`), et dérive
 * tous les autres sens par produit croisé.
 */
export class FxService {
  private readonly provider: FxProvider;
  private readonly store: RateStore;
  private readonly base: string;
  private readonly now: () => Date;

  constructor(options: FxServiceOptions) {
    this.provider = options.provider;
    this.store = options.store;
    this.base = options.base.toUpperCase();
    this.now = options.now ?? ((): Date => new Date());
  }

  /** Taux `base → quote` pour le jour donné (cache puis provider). */
  private async baseRate(quote: string, asOf: string): Promise<number> {
    const q = quote.toUpperCase();
    if (q === this.base) return 1;

    const cached = await this.store.get(this.base, q, asOf);
    if (cached !== undefined) return cached;

    const rates = await this.provider.fetchRates(this.base);
    await Promise.all(
      Object.entries(rates).map(([k, rate]) =>
        this.store.put({ base: this.base, quote: k, rate, asOf, source: this.provider.name }),
      ),
    );

    const rate = rates[q];
    if (rate === undefined || !(rate > 0)) {
      throw new AppError(`Taux de change indisponible: ${this.base}→${q}`, {
        code: "PROVIDER_ERROR",
        retryable: true,
      });
    }
    return rate;
  }

  /** Taux `from → to` (produit croisé via la base). */
  async getRate(from: string, to: string, at?: Date): Promise<number> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return 1;
    const asOf = isoDay(at ?? this.now());
    const [rf, rt] = await Promise.all([this.baseRate(f, asOf), this.baseRate(t, asOf)]);
    return rt / rf;
  }

  /** Convertit `amountCents` de `currency` vers la devise de référence (centimes, arrondi). */
  async toBaseCents(amountCents: number, currency: string, at?: Date): Promise<number> {
    if (currency.toUpperCase() === this.base) return Math.round(amountCents);
    const rate = await this.getRate(currency, this.base, at);
    return Math.round(amountCents * rate);
  }
}
