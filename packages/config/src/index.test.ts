import { ConfigError } from "@fbr/shared";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./index.js";

const baseEnv = {
  DATABASE_URL: "postgresql://fbr:fbr@localhost:5432/fbr",
  REDIS_URL: "redis://localhost:6379",
} satisfies NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("applique les valeurs par défaut avec un env minimal", () => {
    const cfg = loadConfig({ ...baseEnv });
    expect(cfg.env).toBe("development");
    expect(cfg.isProduction).toBe(false);
    expect(cfg.log).toEqual({ level: "info", pretty: false });
    expect(cfg.api).toEqual({ host: "0.0.0.0", port: 3001 });
    expect(cfg.currency).toEqual({ base: "EUR", fxSource: "frankfurter", fixedRates: {} });
    expect(cfg.providers.serpapi).toBeNull();
  });

  it("coerce les types (port, booléens) et structure les providers", () => {
    const cfg = loadConfig({
      ...baseEnv,
      NODE_ENV: "production",
      API_PORT: "8080",
      LOG_PRETTY: "true",
      SERPAPI_API_KEY: "key-123",
    });
    expect(cfg.isProduction).toBe(true);
    expect(cfg.api.port).toBe(8080);
    expect(cfg.log.pretty).toBe(true);
    expect(cfg.providers.serpapi).toEqual({ apiKey: "key-123" });
  });

  it("lève ConfigError listant les variables invalides", () => {
    try {
      loadConfig({ DATABASE_URL: "mysql://x", REDIS_URL: "redis://localhost" });
      expect.unreachable("aurait dû lever");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const ctx = (e as ConfigError).context;
      const paths = (ctx.issues as { path: string }[]).map((i) => i.path);
      expect(paths).toContain("DATABASE_URL");
    }
  });

  it("rejette un NODE_ENV inconnu", () => {
    expect(() => loadConfig({ ...baseEnv, NODE_ENV: "staging" })).toThrow(ConfigError);
  });

  it("traite un secret vide dans .env comme non défini", () => {
    const cfg = loadConfig({
      ...baseEnv,
      SERPAPI_API_KEY: "",
      DUFFEL_API_TOKEN: "",
      TELEGRAM_BOT_TOKEN: "",
    });
    expect(cfg.providers.serpapi).toBeNull();
    expect(cfg.providers.duffel).toBeNull();
    expect(cfg.notifications.telegram).toBeNull();
  });

  it("expose la config du moteur de recherche avec ses défauts", () => {
    const cfg = loadConfig({ ...baseEnv });
    expect(cfg.engine).toEqual({
      schedulerIntervalMs: 15_000,
      searchWorkerConcurrency: 4,
      combinationsPerRun: 6,
      providerMinIntervalSeconds: 60,
      mockScenario: "normal",
    });
  });

  it("expose les seuils de détection (en centimes) avec leurs défauts", () => {
    const cfg = loadConfig({ ...baseEnv });
    expect(cfg.detection).toEqual({
      dropPct: 0.05,
      flashDropPct: 0.12,
      flashDropAbsCents: 12_000,
      flashWindowMinutes: 90,
      analyticsMinSample: 30,
    });
  });

  it("parse FX_FIXED_RATES en objet et rejette un JSON invalide", () => {
    const cfg = loadConfig({
      ...baseEnv,
      FX_SOURCE: "fixed",
      FX_FIXED_RATES: '{"usd":1.1,"gbp":0.85}',
    });
    expect(cfg.currency.fixedRates).toEqual({ USD: 1.1, GBP: 0.85 });
    expect(() => loadConfig({ ...baseEnv, FX_FIXED_RATES: "not-json" })).toThrow(ConfigError);
  });
});
