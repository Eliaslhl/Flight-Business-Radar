import { ProviderError } from "@fbr/shared";
import { type FxProvider } from "./types.js";

/** Taux fixes fournis par la configuration (`FX_SOURCE=fixed`). Base unique. */
export class FixedFxProvider implements FxProvider {
  readonly name = "fixed";
  private readonly base: string;
  private readonly rates: Record<string, number>;

  constructor(base: string, rates: Record<string, number>) {
    this.base = base.toUpperCase();
    this.rates = Object.fromEntries(Object.entries(rates).map(([k, v]) => [k.toUpperCase(), v]));
  }

  fetchRates(base: string): Promise<Record<string, number>> {
    if (base.toUpperCase() !== this.base) {
      return Promise.reject(
        new ProviderError(`FixedFxProvider ne connaît que la base ${this.base}`, {
          retryable: false,
        }),
      );
    }
    return Promise.resolve({ ...this.rates, [this.base]: 1 });
  }
}

type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

interface FrankfurterOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
}

/** [Frankfurter](https://frankfurter.dev) — API publique gratuite, taux BCE, sans clé. */
export class FrankfurterFxProvider implements FxProvider {
  readonly name = "frankfurter";
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: FrankfurterOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://api.frankfurter.dev/v1";
    this.fetchImpl = options.fetchImpl ?? ((url) => fetch(url));
  }

  async fetchRates(base: string): Promise<Record<string, number>> {
    const upper = base.toUpperCase();
    const url = `${this.baseUrl}/latest?base=${encodeURIComponent(upper)}`;
    let payload: unknown;
    try {
      const res = await this.fetchImpl(url);
      if (!res.ok) {
        throw new ProviderError(`Frankfurter HTTP ${String(res.status)}`, { retryable: true });
      }
      payload = await res.json();
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError("Frankfurter injoignable", { retryable: true, cause: error });
    }

    const rates = (payload as { rates?: Record<string, unknown> }).rates;
    if (!rates || typeof rates !== "object") {
      throw new ProviderError("Frankfurter: réponse inattendue", { retryable: false });
    }
    const parsed: Record<string, number> = { [upper]: 1 };
    for (const [quote, value] of Object.entries(rates)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        parsed[quote.toUpperCase()] = value;
      }
    }
    return parsed;
  }
}
