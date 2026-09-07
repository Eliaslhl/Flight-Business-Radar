import {
  flightSearchRequestSchema,
  type FlightOffer,
  type FlightSearchRequest,
} from "@fbr/flight-domain";
import { ProviderRegistry, type FlightProvider } from "@fbr/flight-providers";
import { createSilentLogger } from "@fbr/shared";
import { describe, expect, it, vi } from "vitest";
import { buildConfirmer } from "./confirmer.js";

const request = (): FlightSearchRequest =>
  flightSearchRequestSchema.parse({
    origin: "CDG",
    destinations: ["HND"],
    cabinClass: "BUSINESS",
    departureWindow: { start: "2026-11-10", end: "2026-11-10" },
    tripDuration: { minDays: 12, maxDays: 12 },
  });

const offer = (priceCents: number, availability: FlightOffer["availability"]): FlightOffer =>
  ({
    provider: "x",
    origin: "CDG",
    destination: "HND",
    cabinClass: "BUSINESS",
    outbound: {
      departureDate: "2026-11-10",
      departureAt: "2026-11-10T13:30:00Z",
      arrivalAt: "2026-11-11T09:10:00Z",
      durationMinutes: 700,
      stops: 0,
      marketingAirline: "AF",
      flightNumbers: ["AF276"],
    },
    inbound: {
      departureDate: "2026-11-22",
      departureAt: "2026-11-22T11:00:00Z",
      arrivalAt: "2026-11-22T17:25:00Z",
      durationMinutes: 800,
      stops: 0,
      marketingAirline: "AF",
      flightNumbers: ["AF275"],
    },
    price: { amount: priceCents, currency: "EUR" },
    availability,
    observedAt: "2026-09-06T08:00:00.000Z",
    fingerprint: `fbr_${String(priceCents)}`,
  }) as FlightOffer;

const fx = { toBaseCents: (cents: number) => Promise.resolve(cents) } as never;

const providerFrom = (name: string, offers: FlightOffer[] | Error): FlightProvider => ({
  name,
  searchFlights: () => (offers instanceof Error ? Promise.reject(offers) : Promise.resolve(offers)),
});

describe("buildConfirmer", () => {
  it("sans oracle : re-requête les providers de recherche (comportement Phase 5)", async () => {
    const registry = new ProviderRegistry([providerFrom("search", [offer(120_000, "UNKNOWN")])]);
    const confirm = buildConfirmer(registry, fx);
    const rechecks = await confirm(request());
    expect(rechecks).toEqual([{ priceEurCents: 120_000, availability: "UNKNOWN" }]);
  });

  it("avec oracle : interroge l'oracle, pas le registre (contenu réservable ⇒ AVAILABLE)", async () => {
    const registrySpy = vi.fn();
    const registry = { searchAll: registrySpy } as unknown as ProviderRegistry;
    const oracle = providerFrom("duffel", [offer(118_000, "AVAILABLE")]);
    const confirm = buildConfirmer(registry, fx, { oracle });

    const rechecks = await confirm(request());
    expect(rechecks).toEqual([{ priceEurCents: 118_000, availability: "AVAILABLE" }]);
    expect(registrySpy).not.toHaveBeenCalled();
  });

  it("oracle en échec ⇒ repli sur les providers de recherche", async () => {
    const registry = new ProviderRegistry([providerFrom("search", [offer(121_000, "UNKNOWN")])]);
    const oracle = providerFrom("duffel", new Error("HTTP 503"));
    const confirm = buildConfirmer(registry, fx, { oracle, logger: createSilentLogger() });

    const rechecks = await confirm(request());
    expect(rechecks).toEqual([{ priceEurCents: 121_000, availability: "UNKNOWN" }]);
  });
});
