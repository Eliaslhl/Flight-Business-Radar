import { flightSearchRequestSchema } from "@fbr/flight-domain";
import { describe, expect, it } from "vitest";
import { validateOffer } from "./validate.js";
import { makeOffer, testRequest } from "./fixtures.js";

const validate = (offer: ReturnType<typeof makeOffer>) =>
  validateOffer(offer, { request: testRequest });

describe("validateOffer", () => {
  it("accepte une offre conforme", () => {
    const res = validate(makeOffer());
    expect(res.ok).toBe(true);
  });

  it("rejette un prix nul ou négatif", () => {
    const res = validate(makeOffer({ price: { amount: 0 } }));
    expect(res).toMatchObject({ ok: false, error: { reason: "PRICE_MISSING" } });
  });

  it("rejette une devise différente de celle demandée", () => {
    const res = validate(makeOffer({ price: { amount: 120_000, currency: "USD" } }));
    expect(res).toMatchObject({ ok: false, error: { reason: "CURRENCY_MISMATCH" } });
  });

  it("rejette une cabine non Business", () => {
    const res = validate(makeOffer({ cabinClass: "ECONOMY" }));
    expect(res).toMatchObject({ ok: false, error: { reason: "CABIN_MISMATCH" } });
  });

  it("rejette une destination hors demande", () => {
    const res = validate(makeOffer({ destination: "JFK" }));
    expect(res).toMatchObject({ ok: false, error: { reason: "ROUTE_MISMATCH" } });
  });

  it("rejette un départ hors de la fenêtre", () => {
    const res = validate(
      makeOffer({
        outbound: { departureDate: "2026-12-05", departureAt: "2026-12-05T13:30:00+01:00" },
      }),
    );
    expect(res).toMatchObject({ ok: false, error: { reason: "DATE_INCOHERENT" } });
  });

  it("rejette une durée de séjour hors bornes", () => {
    const res = validate(
      makeOffer({
        inbound: {
          departureDate: "2026-11-30",
          departureAt: "2026-11-30T11:00:00+09:00",
          arrivalAt: "2026-11-30T16:30:00+01:00",
        },
      }),
    );
    expect(res).toMatchObject({ ok: false, error: { reason: "DATE_INCOHERENT" } });
  });

  it("rejette un dépassement du nombre d'escales", () => {
    const res = validate(makeOffer({ inbound: { stops: 2 } }));
    expect(res).toMatchObject({ ok: false, error: { reason: "STOPS_EXCEEDED" } });
  });

  it("rejette une compagnie exclue", () => {
    const res = validate(
      makeOffer({
        outbound: { marketingAirline: "LH", flightNumbers: ["LH710"] },
        inbound: { marketingAirline: "LH", flightNumbers: ["LH711"] },
      }),
    );
    expect(res).toMatchObject({ ok: false, error: { reason: "AIRLINE_EXCLUDED" } });
  });

  it("rejette un montant implausible en devise de référence", () => {
    const res = validate(makeOffer({ price: { amount: 50 * 100 } })); // 50 €
    expect(res).toMatchObject({ ok: false, error: { reason: "PRICE_IMPLAUSIBLE" } });
  });

  it("mode Radar : n'impose pas la destination", () => {
    const radar = flightSearchRequestSchema.parse({
      origin: "CDG",
      departureWindow: { start: "2026-11-01", end: "2026-11-30" },
      tripDuration: { minDays: 7, maxDays: 14 },
    });
    const res = validateOffer(makeOffer({ destination: "ICN" }), { request: radar });
    expect(res.ok).toBe(true);
  });

  describe("tolérance de dates (dateToleranceDays)", () => {
    const exact = flightSearchRequestSchema.parse({
      origin: "CDG",
      destinations: ["HND"],
      departureWindow: { start: "2026-11-10", end: "2026-11-10" },
      tripDuration: { minDays: 10, maxDays: 10 },
      excludedAirlines: ["LH"],
    });
    // Aller J+1, retour J+1 (durée de séjour conservée).
    const dayAfter = makeOffer({
      outbound: {
        departureDate: "2026-11-11",
        departureAt: "2026-11-11T13:30:00+01:00",
        arrivalAt: "2026-11-12T09:15:00+09:00",
      },
      inbound: {
        departureDate: "2026-11-21",
        departureAt: "2026-11-21T11:00:00+09:00",
        arrivalAt: "2026-11-21T16:30:00+01:00",
      },
    });

    it("rejette un décalage d'un jour quand la tolérance est nulle", () => {
      expect(validateOffer(dayAfter, { request: exact })).toMatchObject({
        ok: false,
        error: { reason: "DATE_INCOHERENT" },
      });
    });

    it("accepte un décalage de ± 1 jour avec dateToleranceDays: 1", () => {
      expect(validateOffer(dayAfter, { request: exact, dateToleranceDays: 1 }).ok).toBe(true);
    });

    it("rejette toujours un décalage de 2 jours avec dateToleranceDays: 1", () => {
      const twoDaysAfter = makeOffer({
        outbound: {
          departureDate: "2026-11-12",
          departureAt: "2026-11-12T13:30:00+01:00",
          arrivalAt: "2026-11-13T09:15:00+09:00",
        },
        inbound: {
          departureDate: "2026-11-22",
          departureAt: "2026-11-22T11:00:00+09:00",
          arrivalAt: "2026-11-22T16:30:00+01:00",
        },
      });
      expect(validateOffer(twoDaysAfter, { request: exact, dateToleranceDays: 1 })).toMatchObject({
        ok: false,
        error: { reason: "DATE_INCOHERENT" },
      });
    });
  });
});
