import { loadConfig } from "@fbr/config";
import { createSilentLogger } from "@fbr/shared";
import { describe, expect, it } from "vitest";
import { buildConfirmationOracle, buildProviderRegistry } from "./providers.js";

const baseEnv = {
  DATABASE_URL: "postgresql://fbr:fbr@localhost:5432/fbr",
  REDIS_URL: "redis://localhost:6379",
} satisfies NodeJS.ProcessEnv;

const names = (env: NodeJS.ProcessEnv): string[] =>
  buildProviderRegistry(loadConfig({ ...baseEnv, ...env }), createSilentLogger()).names;

describe("buildProviderRegistry", () => {
  it("aucun provider réel configuré ⇒ MockFlightProvider seul", () => {
    expect(names({})).toEqual(["mock"]);
  });

  it("SERPAPI_API_KEY ⇒ SerpApiFlightProvider", () => {
    expect(names({ SERPAPI_API_KEY: "sk-serp" })).toEqual(["serpapi"]);
  });

  it("FAST_FLIGHTS_URL ⇒ FastFlightsProvider", () => {
    expect(names({ FAST_FLIGHTS_URL: "http://localhost:8000" })).toEqual(["fast-flights"]);
  });

  it("TRAVELPAYOUTS_TOKEN ⇒ TravelpayoutsProvider (source réelle gratuite)", () => {
    expect(names({ TRAVELPAYOUTS_TOKEN: "tp-tok" })).toEqual(["travelpayouts"]);
  });

  it("SerpApi + Travelpayouts ⇒ les deux (précision payante + baseline gratuite)", () => {
    expect(names({ SERPAPI_API_KEY: "sk", TRAVELPAYOUTS_TOKEN: "tp" })).toEqual([
      "serpapi",
      "travelpayouts",
    ]);
  });

  it("SerpApi + fast-flights ⇒ les deux, en parallèle (dédup par le normalizer)", () => {
    expect(
      names({ SERPAPI_API_KEY: "sk-serp", FAST_FLIGHTS_URL: "http://localhost:8000" }),
    ).toEqual(["serpapi", "fast-flights"]);
  });
});

describe("buildConfirmationOracle", () => {
  const oracle = (env: NodeJS.ProcessEnv) =>
    buildConfirmationOracle(loadConfig({ ...baseEnv, ...env }), createSilentLogger());

  it("null sans DUFFEL_API_TOKEN (confirmation via les providers de recherche)", () => {
    expect(oracle({})).toBeNull();
  });

  it("DuffelFlightProvider quand DUFFEL_API_TOKEN est défini", () => {
    expect(oracle({ DUFFEL_API_TOKEN: "duffel_test_x" })?.name).toBe("duffel");
  });
});
