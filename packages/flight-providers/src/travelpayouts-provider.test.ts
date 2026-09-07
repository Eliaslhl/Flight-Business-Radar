import { flightSearchRequestSchema, type FlightSearchRequest } from "@fbr/flight-domain";
import { ProviderError } from "@fbr/shared";
import { describe, expect, it, vi } from "vitest";
import { TravelpayoutsProvider } from "./travelpayouts-provider.js";

const request = (overrides: Record<string, unknown> = {}): FlightSearchRequest =>
  flightSearchRequestSchema.parse({
    origin: "CDG",
    destinations: ["JFK"],
    cabinClass: "ECONOMY",
    departureWindow: { start: "2026-11-10", end: "2026-11-30" },
    tripDuration: { minDays: 10, maxDays: 14 },
    maxStops: 1,
    ...overrides,
  });

const NOW = "2026-11-06T09:00:00.000Z";

/**
 * Réponse Travelpayouts `GET /v2/prices/latest` (données en cache) — contract
 * test. `period_type=month` renvoie tout le mois : on garde les départs dans la
 * fenêtre `[2026-11-10, 2026-11-30]` et une durée de séjour dans `[10, 14]`.
 */
const TP_FIXTURE = {
  success: true,
  currency: "eur",
  error: null,
  data: [
    {
      // dans la fenêtre, 10 nuits, éco, direct → GARDÉ
      origin: "CDG",
      destination: "JFK",
      depart_date: "2026-11-10",
      return_date: "2026-11-20",
      value: 412,
      trip_class: 0,
      number_of_changes: 0,
      found_at: "2026-11-05T14:32:00",
      distance: 5837,
      actual: true,
    },
    {
      // même couple, 1 escale → GARDÉ
      origin: "CDG",
      destination: "JFK",
      depart_date: "2026-11-10",
      return_date: "2026-11-20",
      value: 388,
      trip_class: 0,
      number_of_changes: 1,
      found_at: "2026-11-06T02:10:00Z",
      actual: true,
    },
    {
      // départ 11-12 (dans la fenêtre), 12 nuits (dans [10,14]) → GARDÉ
      origin: "CDG",
      destination: "JFK",
      depart_date: "2026-11-12",
      return_date: "2026-11-24",
      value: 350,
      trip_class: 0,
      number_of_changes: 0,
      found_at: "2026-11-06T03:00:00Z",
    },
    {
      // départ hors fenêtre (décembre) → FILTRÉ
      origin: "CDG",
      destination: "JFK",
      depart_date: "2026-12-05",
      return_date: "2026-12-15",
      value: 300,
      trip_class: 0,
      number_of_changes: 0,
      found_at: "2026-11-06T03:30:00Z",
    },
    {
      // durée 3 nuits < minDays → FILTRÉ
      origin: "CDG",
      destination: "JFK",
      depart_date: "2026-11-15",
      return_date: "2026-11-18",
      value: 275,
      trip_class: 0,
      number_of_changes: 0,
      found_at: "2026-11-06T03:45:00Z",
    },
    {
      // business → FILTRÉ (Data API éco uniquement)
      origin: "CDG",
      destination: "JFK",
      depart_date: "2026-11-10",
      return_date: "2026-11-20",
      value: 1890,
      trip_class: 1,
      number_of_changes: 0,
      found_at: "2026-11-06T04:00:00Z",
    },
  ],
};

const ok = (json: unknown) => ({
  ok: true,
  status: 200,
  text: () => Promise.resolve(JSON.stringify(json)),
});
const fail = (status: number) => ({
  ok: false,
  status,
  text: () => Promise.resolve(""),
});

describe("TravelpayoutsProvider", () => {
  it("convertit les lignes en cache en FlightOffer[] et filtre sur le couple de dates + la classe", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(TP_FIXTURE));
    const provider = new TravelpayoutsProvider({ token: "tp-tok", fetchImpl, now: () => NOW });

    const offers = await provider.searchFlights(request());
    // 3 lignes éco dans la fenêtre + durée valide ; hors-fenêtre / séjour trop
    // court / business → filtrées
    expect(offers).toHaveLength(3);

    const direct = offers.find(
      (o) => o.outbound.stops === 0 && o.outbound.departureDate === "2026-11-10",
    )!;
    expect(direct.provider).toBe("travelpayouts");
    expect(direct.origin).toBe("CDG");
    expect(direct.destination).toBe("JFK");
    expect(direct.cabinClass).toBe("ECONOMY");
    expect(direct.price).toEqual({ amount: 41_200, currency: "EUR" }); // 412 € → centimes
    expect(direct.inbound?.departureDate).toBe("2026-11-20");
    // observedAt = found_at (Z ajouté), PAS l'heure du sondage
    expect(direct.observedAt).toBe("2026-11-05T14:32:00Z");
    expect(direct.availability).toBe("UNKNOWN");
    expect(direct.fingerprint).toMatch(/^fbr_/);

    const oneStop = offers.find((o) => o.outbound.stops === 1)!;
    expect(oneStop.price.amount).toBe(38_800);
    expect(oneStop.observedAt).toBe("2026-11-06T02:10:00Z");
    // empreintes distinctes (nombre d'escales différent)
    expect(direct.fingerprint).not.toBe(oneStop.fingerprint);
  });

  it("envoie les bons paramètres (période mensuelle, trip_class éco, devise, affiliés)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(TP_FIXTURE));
    await new TravelpayoutsProvider({ token: "tp-tok", fetchImpl }).searchFlights(request());
    const call = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }];
    const url = new URL(call[0]);
    expect(url.origin + url.pathname).toBe("https://api.travelpayouts.com/v2/prices/latest");
    // Jeton en en-tête (plus en query param depuis le durcissement de la Data API).
    expect(call[1].headers["x-access-token"]).toBe("tp-tok");
    const q = url.searchParams;
    expect(q.get("token")).toBeNull();
    expect(q.get("origin")).toBe("CDG");
    expect(q.get("destination")).toBe("JFK");
    expect(q.get("period_type")).toBe("month");
    expect(q.get("beginning_of_period")).toBe("2026-11-01");
    expect(q.get("trip_class")).toBe("0"); // Data API éco uniquement
    expect(q.get("currency")).toBe("eur");
    expect(q.get("show_to_affiliates")).toBe("true");
  });

  it("cabine non-économie ⇒ [] sans appel réseau (Data API éco uniquement)", async () => {
    const fetchImpl = vi.fn();
    for (const cabinClass of ["BUSINESS", "FIRST", "PREMIUM_ECONOMY"] as const) {
      await expect(
        new TravelpayoutsProvider({ token: "t", fetchImpl }).searchFlights(request({ cabinClass })),
      ).resolves.toEqual([]);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("génère un lien Aviasales quand un marqueur affilié est fourni", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(TP_FIXTURE));
    const [offer] = await new TravelpayoutsProvider({
      token: "t",
      marker: "123456",
      fetchImpl,
      now: () => NOW,
    }).searchFlights(request());
    expect(offer?.bookingUrl).toContain("aviasales.com/search/CDG1011JFK2011");
    expect(offer?.bookingUrl).toContain("marker=123456");
  });

  it("aucune ligne pour le couple demandé ⇒ [] sans erreur", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ success: true, data: [], currency: "eur" }));
    await expect(
      new TravelpayoutsProvider({ token: "t", fetchImpl }).searchFlights(request()),
    ).resolves.toEqual([]);
  });

  it("`success: false` ⇒ ProviderError non retryable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ok({ success: false, error: "Invalid token", data: [] }));
    await expect(
      new TravelpayoutsProvider({ token: "bad", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ retryable: false });
  });

  it("HTTP 401 / 429 ⇒ ProviderError non retryable, 5xx ⇒ retryable", async () => {
    for (const s of [401, 429]) {
      const fetchImpl = vi.fn().mockResolvedValue(fail(s));
      await expect(
        new TravelpayoutsProvider({ token: "t", fetchImpl }).searchFlights(request()),
      ).rejects.toMatchObject({ retryable: false });
    }
    const fetchImpl = vi.fn().mockResolvedValue(fail(503));
    await expect(
      new TravelpayoutsProvider({ token: "t", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("réseau injoignable ⇒ ProviderError PROVIDER_TIMEOUT", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(
      new TravelpayoutsProvider({ token: "t", fetchImpl }).searchFlights(request()),
    ).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
  });

  it("mode Radar (sans destination) ⇒ ProviderError", async () => {
    await expect(
      new TravelpayoutsProvider({ token: "t", fetchImpl: vi.fn() }).searchFlights(
        request({ destinations: [] }),
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
