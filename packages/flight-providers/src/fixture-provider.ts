import {
  flightOfferSchema,
  isRadarSearch,
  type FlightOffer,
  type FlightSearchRequest,
} from "@fbr/flight-domain";
import { type FlightProvider } from "./provider.js";

export interface FixtureFlightProviderOptions {
  /** Offres (déjà au format `FlightOffer`) ou fabrique à partir de la requête. */
  readonly offers: readonly FlightOffer[] | ((request: FlightSearchRequest) => FlightOffer[]);
  readonly name?: string;
}

/**
 * Provider déterministe rejouant des offres enregistrées — pour les tests
 * contractuels, la CI et le développement hors ligne (aucune I/O réseau).
 */
export class FixtureFlightProvider implements FlightProvider {
  readonly name: string;
  private readonly offers: FixtureFlightProviderOptions["offers"];

  constructor(options: FixtureFlightProviderOptions) {
    this.name = options.name ?? "fixture";
    this.offers = options.offers;
  }

  searchFlights(request: FlightSearchRequest): Promise<FlightOffer[]> {
    const all = typeof this.offers === "function" ? this.offers(request) : [...this.offers];
    return Promise.resolve(
      all
        .filter((o) => o.origin === request.origin)
        .filter((o) => isRadarSearch(request) || request.destinations.includes(o.destination))
        .map((o) => ({ ...o, provider: this.name })),
    );
  }
}

/** Parse un tableau JSON d'offres via le schéma canonique (rejette les invalides). */
export const loadFixtureOffers = (data: unknown): FlightOffer[] => {
  if (!Array.isArray(data)) throw new Error("loadFixtureOffers: tableau attendu");
  return data.map((entry) => flightOfferSchema.parse(entry));
};
