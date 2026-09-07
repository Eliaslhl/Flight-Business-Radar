import { flightSearchRequestSchema, type FlightSearchRequest } from "@fbr/flight-domain";
import { ProviderError } from "@fbr/shared";
import { describe, expect, it, vi } from "vitest";
import { DuffelFlightProvider } from "./duffel-provider.js";

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

/** Réponse Duffel `POST /air/offer_requests?return_offers=true` (v2) — contract test. */
const DUFFEL_FIXTURE = {
  data: {
    id: "orq_0000",
    cabin_class: "business",
    offers: [
      {
        id: "off_0001",
        total_amount: "2451.20",
        total_currency: "EUR",
        base_amount: "2039.20",
        tax_amount: "412.00",
        owner: { iata_code: "AF", name: "Air France" },
        expires_at: "2026-09-06T09:00:00Z",
        slices: [
          {
            origin: { iata_code: "CDG" },
            destination: { iata_code: "HND" },
            duration: "PT13H40M",
            segments: [
              {
                origin: { iata_code: "CDG" },
                destination: { iata_code: "HND" },
                departing_at: "2026-11-10T13:30:00",
                arriving_at: "2026-11-11T09:10:00",
                duration: "PT13H40M",
                marketing_carrier: { iata_code: "AF", name: "Air France" },
                operating_carrier: { iata_code: "AF" },
                marketing_carrier_flight_number: "276",
                aircraft: { name: "Boeing 777-300ER" },
              },
            ],
          },
          {
            origin: { iata_code: "HND" },
            destination: { iata_code: "CDG" },
            duration: "PT14H25M",
            segments: [
              {
                origin: { iata_code: "HND" },
                destination: { iata_code: "CDG" },
                departing_at: "2026-11-22T11:00:00",
                arriving_at: "2026-11-22T17:25:00",
                duration: "PT14H25M",
                marketing_carrier: { iata_code: "AF" },
                marketing_carrier_flight_number: "275",
              },
            ],
          },
        ],
      },
      {
        id: "off_0002",
        total_amount: "2890.00",
        total_currency: "EUR",
        owner: { iata_code: "LH" },
        slices: [
          {
            origin: { iata_code: "CDG" },
            destination: { iata_code: "HND" },
            segments: [
              {
                origin: { iata_code: "CDG" },
                destination: { iata_code: "MUC" },
                departing_at: "2026-11-10T12:40:00",
                arriving_at: "2026-11-10T14:15:00",
                marketing_carrier: { iata_code: "LH" },
                marketing_carrier_flight_number: "2231",
              },
              {
                origin: { iata_code: "MUC" },
                destination: { iata_code: "HND" },
                departing_at: "2026-11-10T16:55:00",
                arriving_at: "2026-11-11T11:20:00",
                marketing_carrier: { iata_code: "LH" },
                marketing_carrier_flight_number: "714",
              },
            ],
          },
          {
            origin: { iata_code: "HND" },
            destination: { iata_code: "CDG" },
            segments: [
              {
                origin: { iata_code: "HND" },
                destination: { iata_code: "CDG" },
                departing_at: "2026-11-22T10:00:00",
                arriving_at: "2026-11-22T16:40:00",
                marketing_carrier: { iata_code: "LH" },
                marketing_carrier_flight_number: "715",
              },
            ],
          },
        ],
      },
    ],
  },
};

const ok = (json: unknown) => ({
  ok: true,
  status: 200,
  text: () => Promise.resolve(JSON.stringify(json)),
});
const fail = (status: number, json: unknown = {}) => ({
  ok: false,
  status,
  text: () => Promise.resolve(JSON.stringify(json)),
});

describe("DuffelFlightProvider", () => {
  it("convertit la réponse Duffel en FlightOffer[] (contract test)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(DUFFEL_FIXTURE));
    const provider = new DuffelFlightProvider({
      token: "duffel_test_x",
      fetchImpl,
      now: () => NOW,
    });

    const offers = await provider.searchFlights(request());
    expect(offers).toHaveLength(2);

    const af = offers[0]!;
    expect(af.provider).toBe("duffel");
    expect(af.availability).toBe("AVAILABLE"); // contenu réservable
    expect(af.origin).toBe("CDG");
    expect(af.destination).toBe("HND");
    expect(af.cabinClass).toBe("BUSINESS");
    expect(af.price).toEqual({ amount: 245_120, currency: "EUR" }); // "2451.20" → centimes
    expect(af.outbound.marketingAirline).toBe("AF");
    expect(af.outbound.flightNumbers).toEqual(["AF276"]);
    expect(af.outbound.departureAt).toBe("2026-11-10T13:30:00Z"); // suffixe Z ajouté
    expect(af.outbound.durationMinutes).toBe(820); // PT13H40M
    expect(af.outbound.stops).toBe(0);
    expect(af.inbound?.departureDate).toBe("2026-11-22");
    expect(af.inbound?.flightNumbers).toEqual(["AF275"]);
    expect(af.fingerprint).toMatch(/^fbr_/);

    const lh = offers[1]!;
    expect(lh.outbound.marketingAirline).toBe("LH");
    expect(lh.outbound.stops).toBe(1); // 2 segments
    expect(lh.outbound.flightNumbers).toEqual(["LH2231", "LH714"]);
    expect(lh.price.amount).toBe(289_000);
  });

  it("envoie un offer_request round-trip business avec les bons en-têtes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(DUFFEL_FIXTURE));
    await new DuffelFlightProvider({ token: "tok", fetchImpl }).searchFlights(request());
    const [url, init] = fetchImpl.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://api.duffel.com/air/offer_requests?return_offers=true");
    expect(init.headers.authorization).toBe("Bearer tok");
    expect(init.headers["Duffel-Version"]).toBe("v2");
    const body = JSON.parse(init.body) as {
      data: {
        slices: { origin: string; destination: string; departure_date: string }[];
        cabin_class: string;
        max_connections: number;
        passengers: { type: string }[];
      };
    };
    expect(body.data.cabin_class).toBe("business");
    expect(body.data.max_connections).toBe(1);
    expect(body.data.passengers).toEqual([{ type: "adult" }]);
    expect(body.data.slices).toEqual([
      { origin: "CDG", destination: "HND", departure_date: "2026-11-10" },
      { origin: "HND", destination: "CDG", departure_date: "2026-11-22" },
    ]);
  });

  it("aucune offre ⇒ [] sans erreur", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ data: { id: "orq_1", offers: [] } }));
    await expect(
      new DuffelFlightProvider({ token: "t", fetchImpl }).searchFlights(request()),
    ).resolves.toEqual([]);
  });

  it("HTTP 401 ⇒ ProviderError non retryable, message Duffel repris", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fail(401, { errors: [{ title: "Invalid access token" }] }));
    await expect(
      new DuffelFlightProvider({ token: "bad", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("HTTP 429 (quota) ⇒ ProviderError non retryable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(429));
    await expect(
      new DuffelFlightProvider({ token: "t", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("HTTP 5xx ⇒ ProviderError retryable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(503));
    await expect(
      new DuffelFlightProvider({ token: "t", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("réseau injoignable ⇒ ProviderError PROVIDER_TIMEOUT", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      new DuffelFlightProvider({ token: "t", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT", retryable: true });
  });

  it("mode Radar (sans destination) ⇒ ProviderError", async () => {
    await expect(
      new DuffelFlightProvider({ token: "t", fetchImpl: vi.fn() }).searchFlights(
        request({ destinations: [] }),
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("plafonne le nombre de destinations (garde-fou coût)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ data: { offers: [] } }));
    await new DuffelFlightProvider({ token: "t", fetchImpl, maxDestinations: 2 }).searchFlights(
      request({ destinations: ["HND", "ICN", "JFK", "DXB"] }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
