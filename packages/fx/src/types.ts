/** Taux : `1 <base>` = `rate` `<quote>`, valable pour la date `asOf` (YYYY-MM-DD). */
export interface FxRate {
  readonly base: string;
  readonly quote: string;
  readonly rate: number;
  readonly asOf: string;
  readonly source: string;
}

/** Fournisseur de taux de change. Ne connaît que le sens `base → quotes`. */
export interface FxProvider {
  readonly name: string;
  /** Renvoie `{ <quote>: rate }` où `1 <base>` = `rate` `<quote>`. */
  fetchRates(base: string): Promise<Record<string, number>>;
}

/** Cache persistant des taux (implémenté par `@fbr/database` côté worker). */
export interface RateStore {
  get(base: string, quote: string, asOf: string): Promise<number | undefined>;
  put(rate: FxRate): Promise<void>;
}
