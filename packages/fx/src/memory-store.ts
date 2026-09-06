import { type FxRate, type RateStore } from "./types.js";

/** Cache de taux en mémoire (tests, ou repli quand aucune base n'est branchée). */
export class MemoryRateStore implements RateStore {
  private readonly map = new Map<string, number>();

  private key(base: string, quote: string, asOf: string): string {
    return `${base.toUpperCase()}:${quote.toUpperCase()}:${asOf}`;
  }

  get(base: string, quote: string, asOf: string): Promise<number | undefined> {
    return Promise.resolve(this.map.get(this.key(base, quote, asOf)));
  }

  put(rate: FxRate): Promise<void> {
    this.map.set(this.key(rate.base, rate.quote, rate.asOf), rate.rate);
    return Promise.resolve();
  }
}
