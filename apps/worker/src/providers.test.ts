import { loadConfig } from "@fbr/config";
import { createSilentLogger } from "@fbr/shared";
import { describe, expect, it } from "vitest";
import { buildProviderRegistry } from "./providers.js";

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

  it("SerpApi + fast-flights ⇒ les deux, en parallèle (dédup par le normalizer)", () => {
    expect(
      names({ SERPAPI_API_KEY: "sk-serp", FAST_FLIGHTS_URL: "http://localhost:8000" }),
    ).toEqual(["serpapi", "fast-flights"]);
  });
});
