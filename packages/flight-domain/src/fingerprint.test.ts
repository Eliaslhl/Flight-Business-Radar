import { describe, expect, it } from "vitest";
import { computeFingerprint, type FingerprintInput } from "./fingerprint.js";

const base: FingerprintInput = {
  origin: "CDG",
  destination: "HND",
  cabinClass: "BUSINESS",
  outbound: {
    departureDate: "2026-11-10",
    departureAt: "2026-11-10T13:30:00+01:00",
    marketingAirline: "AF",
    flightNumbers: ["AF276"],
    stops: 0,
  },
  inbound: {
    departureDate: "2026-11-20",
    departureAt: "2026-11-20T11:00:00+09:00",
    marketingAirline: "AF",
    flightNumbers: ["AF275"],
    stops: 0,
  },
};

describe("computeFingerprint", () => {
  it("est stable et préfixé", () => {
    const fp = computeFingerprint(base);
    expect(fp).toMatch(/^fbr_[0-9a-f]{20}$/);
    expect(computeFingerprint(base)).toBe(fp);
  });

  it("est insensible à l'ordre et à la casse des numéros de vol", () => {
    const a = computeFingerprint({
      ...base,
      outbound: { ...base.outbound, flightNumbers: ["AF276", "AF9999"] },
    });
    const b = computeFingerprint({
      ...base,
      outbound: { ...base.outbound, flightNumbers: ["af9999", "af276"] },
    });
    expect(a).toBe(b);
  });

  it("distingue les itinéraires différents", () => {
    const fp = computeFingerprint(base);
    expect(computeFingerprint({ ...base, cabinClass: "ECONOMY" })).not.toBe(fp);
    expect(
      computeFingerprint({ ...base, outbound: { ...base.outbound, departureDate: "2026-11-11" } }),
    ).not.toBe(fp);
    expect(computeFingerprint({ ...base, inbound: null })).not.toBe(fp);
  });

  it("retombe sur compagnie+heure+escales quand les numéros manquent", () => {
    const noNumbers: FingerprintInput = {
      ...base,
      outbound: { ...base.outbound, flightNumbers: [] },
      inbound: base.inbound ? { ...base.inbound, flightNumbers: [] } : null,
    };
    const fp = computeFingerprint(noNumbers);
    expect(fp).toMatch(/^fbr_/);
    // écart < 5 min => même empreinte
    expect(
      computeFingerprint({
        ...noNumbers,
        outbound: { ...noNumbers.outbound, departureAt: "2026-11-10T13:32:00+01:00" },
      }),
    ).toBe(fp);
    // écart important => empreinte différente
    expect(
      computeFingerprint({
        ...noNumbers,
        outbound: { ...noNumbers.outbound, departureAt: "2026-11-10T18:00:00+01:00" },
      }),
    ).not.toBe(fp);
  });
});
