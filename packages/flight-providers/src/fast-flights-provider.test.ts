import { flightSearchRequestSchema, type FlightSearchRequest } from "@fbr/flight-domain";
import { ProviderError } from "@fbr/shared";
import { describe, expect, it, vi } from "vitest";
import { FastFlightsProvider } from "./fast-flights-provider.js";

const request = (overrides: Record<string, unknown> = {}): FlightSearchRequest =>
  flightSearchRequestSchema.parse({
    origin: "CDG",
    destinations: ["HND"],
    departureWindow: { start: "2026-11-10", end: "2026-11-30" },
    tripDuration: { minDays: 10, maxDays: 14 },
    ...overrides,
  });

const okResponse = (offers: unknown[]) => ({
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      provider: "fast-flights",
      mode: "fixture",
      degraded: false,
      currency: "EUR",
      fetchedAt: "2026-09-06T08:00:00.000Z",
      offers,
    }),
});

const NOW = "2026-09-06T08:00:00.000Z";

describe("FastFlightsProvider", () => {
  it("convertit la réponse du sidecar en FlightOffer (nom compagnie → code IATA)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse([
        {
          priceCents: 138900,
          currency: "EUR",
          totalStops: 0,
          isBest: true,
          outbound: {
            airlineName: "Air France",
            departureAt: "2026-11-10T13:30:00+00:00",
            arrivalAt: "2026-11-11T09:15:00+00:00",
            durationMinutes: 705,
            stops: 0,
          },
          inbound: {
            airlineName: "Air France",
            departureAt: "2026-11-20T11:00:00+00:00",
            arrivalAt: "2026-11-20T16:30:00+00:00",
            durationMinutes: 800,
            stops: 0,
          },
        },
      ]),
    );
    const provider = new FastFlightsProvider({
      baseUrl: "http://scraper:8000/",
      fetchImpl,
      now: () => NOW,
    });

    const [offer] = await provider.searchFlights(request());
    expect(offer?.provider).toBe("fast-flights");
    expect(offer?.origin).toBe("CDG");
    expect(offer?.destination).toBe("HND");
    expect(offer?.outbound.marketingAirline).toBe("AF");
    expect(offer?.outbound.departureDate).toBe("2026-11-10");
    expect(offer?.inbound?.departureDate).toBe("2026-11-20");
    expect(offer?.price).toEqual({ amount: 138900, currency: "EUR" });
    expect(offer?.fingerprint).toMatch(/^fbr_/);

    const [url, init] = fetchImpl.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("http://scraper:8000/search");
    expect(JSON.parse(init.body)).toMatchObject({
      origin: "CDG",
      destination: "HND",
      outboundDate: "2026-11-10",
      returnDate: "2026-11-20",
      cabinClass: "business",
    });
  });

  it("synthétise les horaires manquants et reste valide", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      okResponse([
        {
          priceCents: 152000,
          currency: "EUR",
          totalStops: 1,
          outbound: { airlineCode: "LH", stops: 1 },
          inbound: { airlineCode: "LH", stops: 1 },
        },
      ]),
    );
    const provider = new FastFlightsProvider({ baseUrl: "http://x", fetchImpl, now: () => NOW });
    const [offer] = await provider.searchFlights(request());
    expect(offer?.outbound.marketingAirline).toBe("LH");
    expect(offer?.outbound.durationMinutes).toBeGreaterThan(0);
    expect(new Date(offer!.outbound.arrivalAt).getTime()).toBeGreaterThan(
      new Date(offer!.outbound.departureAt).getTime(),
    );
  });

  it("réponse dégradée / vide ⇒ [] sans erreur", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ currency: "EUR", degraded: true, offers: [], error: "AttributeError" }),
    });
    const provider = new FastFlightsProvider({ baseUrl: "http://x", fetchImpl });
    await expect(provider.searchFlights(request())).resolves.toEqual([]);
  });

  it("HTTP 5xx ⇒ ProviderError retryable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 502, json: () => Promise.resolve({}) });
    const provider = new FastFlightsProvider({ baseUrl: "http://x", fetchImpl });
    await expect(provider.searchFlights(request())).rejects.toMatchObject({ retryable: true });
  });

  it("réseau injoignable ⇒ ProviderError PROVIDER_TIMEOUT", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const provider = new FastFlightsProvider({ baseUrl: "http://x", fetchImpl });
    await expect(provider.searchFlights(request())).rejects.toMatchObject({
      code: "PROVIDER_TIMEOUT",
    });
  });

  it("payload invalide ⇒ ProviderError non retryable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ nope: true }) });
    const provider = new FastFlightsProvider({ baseUrl: "http://x", fetchImpl });
    await expect(provider.searchFlights(request())).rejects.toBeInstanceOf(ProviderError);
  });

  it("mode Radar (sans destination) ⇒ ProviderError", async () => {
    const provider = new FastFlightsProvider({ baseUrl: "http://x", fetchImpl: vi.fn() });
    await expect(provider.searchFlights(request({ destinations: [] }))).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});
