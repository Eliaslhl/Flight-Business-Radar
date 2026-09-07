import { type FlightOffer, type FlightSearchRequest } from "@fbr/flight-domain";
import { type FlightProvider, type ProviderRegistry } from "@fbr/flight-providers";
import { type FxService } from "@fbr/fx";
import { normalizeSearchResults } from "@fbr/normalizer";
import { type Logger } from "@fbr/shared";

export interface RecheckedOffer {
  readonly priceEurCents: number;
  readonly availability: string;
}

export type ConfirmFn = (request: FlightSearchRequest) => Promise<RecheckedOffer[]>;

export interface ConfirmerOptions {
  /**
   * Oracle indépendant (Duffel — contenu réellement réservable). Si fourni, il
   * est interrogé **en premier** pour valider une baisse ; en cas d'échec on
   * retombe sur les providers de recherche (confirmation dégradée).
   */
  readonly oracle?: FlightProvider;
  readonly logger?: Logger;
}

const toRechecks = async (
  request: FlightSearchRequest,
  offers: FlightOffer[],
  fx: FxService,
): Promise<RecheckedOffer[]> => {
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

/**
 * Re-interroge pour un itinéraire précis et renvoie les prix normalisés en EUR
 * (Phase 0 §10). Utilisé par le pipeline d'alerte pour confirmer un prix
 * exceptionnellement bas avant de notifier. Avec un `oracle` (Duffel), la
 * confirmation s'appuie sur du contenu **réellement réservable** plutôt que sur
 * une re-requête du même provider de recherche.
 */
export const buildConfirmer = (
  registry: ProviderRegistry,
  fx: FxService,
  options: ConfirmerOptions = {},
): ConfirmFn => {
  const { oracle, logger } = options;
  return async (request) => {
    if (oracle) {
      try {
        const offers = await oracle.searchFlights(request);
        return await toRechecks(request, offers, fx);
      } catch (error) {
        logger?.warn(
          { event: "confirm_oracle_failed", oracle: oracle.name, err: String(error) },
          "oracle de confirmation indisponible — repli sur les providers de recherche",
        );
      }
    }
    const { offers } = await registry.searchAll(request);
    return toRechecks(request, offers, fx);
  };
};
