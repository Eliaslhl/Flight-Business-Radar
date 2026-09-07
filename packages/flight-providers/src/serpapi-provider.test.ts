import { flightSearchRequestSchema, type FlightSearchRequest } from "@fbr/flight-domain";
import { describe, expect, it, vi } from "vitest";
import { SerpApiFlightProvider } from "./serpapi-provider.js";

const request = (overrides: Record<string, unknown> = {}): FlightSearchRequest =>
  flightSearchRequestSchema.parse({
    origin: "CDG",
    destinations: ["HND"],
    cabinClass: "BUSINESS",
    departureWindow: { start: "2026-11-10", end: "2026-11-30" },
    tripDuration: { minDays: 12, maxDays: 14 },
    maxStops: 1,
    ...overrides,
  });

const NOW = "2026-09-06T08:00:00.000Z";

/**
 * Fixture représentative d'une réponse SerpApi `engine=google_flights`
 * (round trip, business, CDG→HND) — contract test.
 */
const SERPAPI_FIXTURE = {
  search_metadata: { id: "abc", status: "Success" },
  search_parameters: {
    engine: "google_flights",
    departure_id: "CDG",
    arrival_id: "HND",
    outbound_date: "2026-11-10",
    return_date: "2026-11-22",
    travel_class: 3,
    type: 1,
  },
  best_flights: [
    {
      flights: [
        {
          departure_airport: {
            name: "Paris Charles de Gaulle",
            id: "CDG",
            time: "2026-11-10 10:15",
          },
          arrival_airport: { name: "Tokyo Haneda", id: "HND", time: "2026-11-11 06:55" },
          duration: 760,
          airplane: "Boeing 777",
          airline: "Air France",
          airline_logo: "https://serpapi.com/af.png",
          travel_class: "Business",
          flight_number: "AF 276",
          legroom: "78 in",
          overnight: true,
        },
      ],
      layovers: [],
      total_duration: 760,
      carbon_emissions: { this_flight: 1_800_000 },
      price: 2318,
      type: "Round trip",
      airline_logo: "https://serpapi.com/af.png",
      departure_token: "WyJDalJ",
    },
    {
      flights: [
        {
          departure_airport: {
            name: "Paris Charles de Gaulle",
            id: "CDG",
            time: "2026-11-10 12:40",
          },
          arrival_airport: { name: "Munich", id: "MUC", time: "2026-11-10 14:15" },
          duration: 95,
          airline: "Lufthansa",
          travel_class: "Business",
          flight_number: "LH 2231",
        },
        {
          departure_airport: { name: "Munich", id: "MUC", time: "2026-11-10 16:55" },
          arrival_airport: { name: "Tokyo Haneda", id: "HND", time: "2026-11-11 11:20" },
          duration: 685,
          airline: "Lufthansa",
          travel_class: "Business",
          flight_number: "LH 714",
        },
      ],
      layovers: [{ duration: 160, name: "Munich", id: "MUC" }],
      total_duration: 940,
      price: 2691,
      type: "Round trip",
    },
  ],
  other_flights: [
    {
      // option sans prix ⇒ ignorée
      flights: [
        {
          departure_airport: { id: "CDG", time: "2026-11-10 09:00" },
          arrival_airport: { id: "HND", time: "2026-11-11 05:00" },
          duration: 720,
          airline: "Japan Airlines",
          flight_number: "JL 46",
        },
      ],
      layovers: [],
      total_duration: 720,
      type: "Round trip",
    },
  ],
  price_insights: {
    lowest_price: 2318,
    price_level: "low",
    typical_price_range: [2400, 3600],
  },
};

const ok = (json: unknown) => ({
  ok: true,
  status: 200,
  text: () => Promise.resolve(JSON.stringify(json)),
});

const travelClassOf = (call: unknown): string =>
  new URL((call as [string])[0]).searchParams.get("travel_class") ?? "";

/** Ne renvoie la fixture (prix business) que pour l'appel `travel_class=3`. */
const cabinAwareFetch = () =>
  vi
    .fn()
    .mockImplementation((url: string) =>
      Promise.resolve(
        ok(
          new URL(url).searchParams.get("travel_class") === "3"
            ? SERPAPI_FIXTURE
            : { best_flights: [], other_flights: [] },
        ),
      ),
    );

describe("SerpApiFlightProvider", () => {
  it("interroge 3 cabines par passage (Éco / Éco+ / Affaires)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ best_flights: [], other_flights: [] }));
    await new SerpApiFlightProvider({ apiKey: "k", fetchImpl }).searchFlights(request());
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.map(travelClassOf).sort()).toEqual(["1", "2", "3"]);
  });

  it("convertit la réponse SerpApi en FlightOffer[] (contract test)", async () => {
    const fetchImpl = cabinAwareFetch();
    const provider = new SerpApiFlightProvider({ apiKey: "sk-serp", fetchImpl, now: () => NOW });

    const offers = await provider.searchFlights(request());
    expect(offers).toHaveLength(2); // l'option sans prix est écartée

    const af = offers[0]!;
    expect(af.provider).toBe("serpapi");
    expect(af.origin).toBe("CDG");
    expect(af.destination).toBe("HND");
    expect(af.cabinClass).toBe("BUSINESS"); // vient de l'appel travel_class=3
    expect(af.outbound.marketingAirline).toBe("AF");
    expect(af.outbound.flightNumbers).toEqual(["AF276"]); // « AF 276 » normalisé
    expect(af.outbound.departureDate).toBe("2026-11-10");
    expect(af.outbound.departureAt).toBe("2026-11-10T10:15:00Z");
    expect(af.outbound.stops).toBe(0);
    expect(af.price).toEqual({ amount: 231_800, currency: "EUR" }); // 2318 € → centimes
    expect(af.inbound?.departureDate).toBe("2026-11-22"); // retour synthétisé
    expect(af.inbound?.marketingAirline).toBe("AF");
    expect(af.fingerprint).toMatch(/^fbr_/);
    // lien Google Flights pré-rempli (route + dates), pas de crédit consommé
    expect(af.bookingUrl).toContain("google.com/travel/flights");
    expect(af.bookingUrl).toContain("CDG");
    expect(af.bookingUrl).toContain("HND");

    const lh = offers[1]!;
    expect(lh.outbound.marketingAirline).toBe("LH");
    expect(lh.outbound.stops).toBe(1); // 2 legs → 1 escale
    expect(lh.outbound.flightNumbers).toEqual(["LH2231", "LH714"]);
    expect(lh.price.amount).toBe(269_100);
  });

  it("envoie les bons paramètres de requête (round trip, stops, devise, cabines)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ best_flights: [], other_flights: [] }));
    await new SerpApiFlightProvider({ apiKey: "sk-serp", fetchImpl }).searchFlights(
      request({ currency: "EUR", maxStops: 1 }),
    );
    const url = new URL((fetchImpl.mock.calls[0] as [string])[0]);
    expect(url.origin + url.pathname).toBe("https://serpapi.com/search.json");
    const q = url.searchParams;
    expect(q.get("engine")).toBe("google_flights");
    expect(q.get("api_key")).toBe("sk-serp");
    expect(q.get("departure_id")).toBe("CDG");
    expect(q.get("arrival_id")).toBe("HND");
    expect(q.get("outbound_date")).toBe("2026-11-10");
    expect(q.get("return_date")).toBe("2026-11-22");
    expect(q.get("type")).toBe("1");
    expect(q.get("stops")).toBe("2"); // maxStops 1 → « ≤ 1 escale »
    expect(q.get("currency")).toBe("EUR");
    // les 3 cabines sont bien couvertes
    expect(fetchImpl.mock.calls.map(travelClassOf).sort()).toEqual(["1", "2", "3"]);
  });

  it("SerpApi `error` = aucun résultat ⇒ [] sans erreur", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        ok({ error: "Google Flights hasn't returned any results for this query." }),
      );
    await expect(
      new SerpApiFlightProvider({ apiKey: "k", fetchImpl }).searchFlights(request()),
    ).resolves.toEqual([]);
  });

  it("SerpApi `error` = requête invalide ⇒ ProviderError non retryable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ error: "Invalid API key." }));
    await expect(
      new SerpApiFlightProvider({ apiKey: "k", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("HTTP 401 ⇒ ProviderError non retryable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve("nope") });
    await expect(
      new SerpApiFlightProvider({ apiKey: "bad", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("HTTP 429 (quota) ⇒ ProviderError non retryable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429, text: () => Promise.resolve("") });
    await expect(
      new SerpApiFlightProvider({ apiKey: "k", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("HTTP 5xx ⇒ ProviderError retryable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: () => Promise.resolve("") });
    await expect(
      new SerpApiFlightProvider({ apiKey: "k", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("réseau injoignable ⇒ ProviderError PROVIDER_TIMEOUT", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      new SerpApiFlightProvider({ apiKey: "k", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT", retryable: true });
  });

  it("sans destination (Radar) ⇒ [] sans appel réseau (réservé au point-à-point)", async () => {
    const fetchImpl = vi.fn();
    await expect(
      new SerpApiFlightProvider({ apiKey: "k", fetchImpl }).searchFlights(
        request({ destinations: [] }),
      ),
    ).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requête multi-destinations ⇒ [] sans appel réseau (garde-fou budget)", async () => {
    const fetchImpl = vi.fn();
    await expect(
      new SerpApiFlightProvider({ apiKey: "k", fetchImpl }).searchFlights(
        request({ destinations: ["HND", "ICN", "JFK"] }),
      ),
    ).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
