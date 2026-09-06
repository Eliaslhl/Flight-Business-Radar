import { type FlightSearchRequest } from "@fbr/flight-domain";
import { type ProviderRegistry } from "@fbr/flight-providers";
import { type FxService } from "@fbr/fx";
import { normalizeSearchResults } from "@fbr/normalizer";

export interface RecheckedOffer {
  readonly priceEurCents: number;
  readonly availability: string;
}

export type ConfirmFn = (request: FlightSearchRequest) => Promise<RecheckedOffer[]>;

/**
 * Re-interroge les providers pour un itinéraire précis et renvoie les prix
 * normalisés en EUR (Phase 0 §10). Utilisé par le pipeline d'alerte pour
 * confirmer un prix exceptionnellement bas avant de notifier.
 */
export const buildConfirmer =
  (registry: ProviderRegistry, fx: FxService): ConfirmFn =>
  async (request) => {
    const { offers } = await registry.searchAll(request);
    const { offers: kept } = normalizeSearchResults(request, offers, {
      baseCurrency: request.currency,
    });
    return Promise.all(
      kept.map(async (o) => ({
        priceEurCents: await fx.toBaseCents(o.price.amount, o.price.currency),
        availability: o.availability,
      })),
    );
  };
