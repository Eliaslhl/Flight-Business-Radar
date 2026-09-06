import { z } from "zod";

/**
 * Schéma de configuration applicative. Toute variable d'environnement consommée
 * par le code passe par ici : validation stricte, valeurs par défaut explicites,
 * pas de `process.env` disséminé dans le code (Phase 0 §23 / §40).
 */

const nodeEnv = z.enum(["development", "test", "production"]).default("development");
const logLevel = z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info");
const boolish = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
const port = z.coerce.number().int().positive().max(65535);
const posInt = z.coerce.number().int().positive();
/** Secret optionnel : une chaîne vide dans `.env` est traitée comme « non défini ». */
const optionalSecret = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().min(1).optional(),
);

export const configSchema = z
  .object({
    NODE_ENV: nodeEnv,
    LOG_LEVEL: logLevel,
    LOG_PRETTY: boolish.default("false"),

    DATABASE_URL: z.string().url().startsWith("postgres"),
    REDIS_URL: z.string().url().startsWith("redis"),

    API_HOST: z.string().min(1).default("0.0.0.0"),
    API_PORT: port.default(3001),

    BASE_CURRENCY: z
      .string()
      .regex(/^[A-Z]{3}$/, "attendu un code ISO 4217, ex. EUR")
      .default("EUR"),
    FX_SOURCE: z.enum(["frankfurter", "ecb", "fixed"]).default("frankfurter"),

    // Moteur de recherche / surveillance (Phase 3).
    SCHEDULER_INTERVAL_MS: posInt.default(15_000),
    SEARCH_WORKER_CONCURRENCY: posInt.default(4),
    SEARCH_COMBINATIONS_PER_RUN: posInt.default(6),
    PROVIDER_MIN_INTERVAL_SECONDS: posInt.default(60),
    // Scénario du MockFlightProvider tant qu'aucun provider réel n'est branché (Phase 7).
    MOCK_SCENARIO: z
      .enum([
        "normal",
        "gradual-drop",
        "flash-drop",
        "record-low",
        "unavailable",
        "error",
        "timeout",
      ])
      .default("normal"),

    // Providers — optionnels tant que non activés (Phase 7+).
    SERPAPI_API_KEY: optionalSecret,
    DUFFEL_API_TOKEN: optionalSecret,

    // Notifications — optionnel (Phase 8+).
    TELEGRAM_BOT_TOKEN: optionalSecret,
  })
  .transform((raw) => ({
    env: raw.NODE_ENV,
    isProduction: raw.NODE_ENV === "production",
    isTest: raw.NODE_ENV === "test",
    log: {
      level: raw.LOG_LEVEL,
      pretty: raw.LOG_PRETTY,
    },
    database: {
      url: raw.DATABASE_URL,
    },
    redis: {
      url: raw.REDIS_URL,
    },
    api: {
      host: raw.API_HOST,
      port: raw.API_PORT,
    },
    currency: {
      base: raw.BASE_CURRENCY,
      fxSource: raw.FX_SOURCE,
    },
    engine: {
      schedulerIntervalMs: raw.SCHEDULER_INTERVAL_MS,
      searchWorkerConcurrency: raw.SEARCH_WORKER_CONCURRENCY,
      combinationsPerRun: raw.SEARCH_COMBINATIONS_PER_RUN,
      providerMinIntervalSeconds: raw.PROVIDER_MIN_INTERVAL_SECONDS,
      mockScenario: raw.MOCK_SCENARIO,
    },
    providers: {
      serpapi: raw.SERPAPI_API_KEY ? { apiKey: raw.SERPAPI_API_KEY } : null,
      duffel: raw.DUFFEL_API_TOKEN ? { token: raw.DUFFEL_API_TOKEN } : null,
    },
    notifications: {
      telegram: raw.TELEGRAM_BOT_TOKEN ? { botToken: raw.TELEGRAM_BOT_TOKEN } : null,
    },
  }));

export type RawConfigInput = z.input<typeof configSchema>;
export type AppConfig = z.output<typeof configSchema>;
