import { type FlightOffer, type FlightSearchRequest } from "@fbr/flight-domain";

/**
 * Contrat commun à tous les fournisseurs de données de vol (Phase 0 §4).
 * Chaque provider est responsable de convertir sa réponse brute vers le modèle
 * interne `FlightOffer` (Phase 0 §27). Le reste de l'application ne dépend
 * jamais d'une API fournisseur concrète.
 */
export interface FlightProvider {
  /** Identifiant court et stable, ex. `"mock"`, `"serpapi"`, `"duffel"`. */
  readonly name: string;

  /**
   * Recherche des offres pour **un** couple de dates (celui porté par la
   * requête). La génération des combinaisons de dates est faite en amont
   * par le moteur de recherche (Phase 3).
   *
   * Doit rejeter avec une `ProviderError` (`@fbr/shared`) en cas d'échec
   * technique — jamais retourner un tableau contenant des offres invalides.
   */
  searchFlights(request: FlightSearchRequest): Promise<FlightOffer[]>;
}
