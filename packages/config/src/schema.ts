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
const ratio = z.coerce.number().positive().max(1);
/** Objet `{ USD: 1.08, ... }` fourni en JSON dans une variable d'environnement. */
const jsonRates = z
  .string()
  .optional()
  .transform((raw, ctx): Record<string, number> => {
    const trimmed = raw?.trim();
    if (!trimmed) return {};
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "JSON de taux de change invalide" });
      return z.NEVER;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "objet de taux attendu" });
      return z.NEVER;
    }
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "number" || !(value > 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `taux invalide pour ${key}` });
        return z.NEVER;
      }
      out[key.toUpperCase()] = value;
    }
    return out;
  });
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
    FX_SOURCE: z.enum(["frankfurter", "fixed"]).default("frankfurter"),
    FX_FIXED_RATES: jsonRates,

    // Détection de baisses (Phase 4) — seuils configurables (Phase 0 §9).
    DROP_PCT: ratio.default(0.05),
    FLASH_DROP_PCT: ratio.default(0.12),
    FLASH_DROP_ABS_EUR: posInt.default(120),
    FLASH_WINDOW_MINUTES: posInt.default(90),
    ANALYTICS_MIN_SAMPLE: posInt.default(30),

    // Moteur de recherche / surveillance (Phase 3).
    SCHEDULER_INTERVAL_MS: posInt.default(15_000),
    SEARCH_WORKER_CONCURRENCY: posInt.default(4),
    SEARCH_COMBINATIONS_PER_RUN: posInt.default(6),
    PROVIDER_MIN_INTERVAL_SECONDS: posInt.default(60),
    /** Mode Radar : destinations seed sondées par run (tranche rotative). */
    RADAR_BATCH_SIZE: posInt.max(60).default(8),
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
    // Sidecar `fast-flights` (services/flight-scraper) : si défini, le worker
    // utilise FastFlightsProvider au lieu du MockFlightProvider.
    FAST_FLIGHTS_URL: z.string().url().optional(),
    FAST_FLIGHTS_TIMEOUT_MS: posInt.default(20_000),
    // SerpApi Google Flights (1er provider réel payant — 1 recherche = 1 crédit).
    SERPAPI_API_KEY: optionalSecret,
    SERPAPI_TIMEOUT_MS: posInt.default(20_000),
    /** Plafond de destinations interrogées par run (garde-fou budget mode Radar). */
    SERPAPI_MAX_DESTINATIONS: posInt.max(60).default(8),
    DUFFEL_API_TOKEN: optionalSecret,

    // Notifications (Phase 8) — chaque canal s'active quand SA config est
    // complète ; le canal `console` est toujours actif. Aucun secret en dur.
    TELEGRAM_BOT_TOKEN: optionalSecret,
    TELEGRAM_CHAT_ID: z.string().trim().min(1).optional(),
    /** SMTP unique, ex. `smtp://user:pass@host:587` ou `smtps://…:465`. */
    SMTP_URL: optionalSecret,
    EMAIL_FROM: z.string().trim().min(1).optional(),
    EMAIL_TO: z.string().trim().min(1).optional(),
    /** Webhook générique (Discord / Slack / ntfy / custom) : POST JSON. */
    NOTIFICATION_WEBHOOK_URL: z.string().url().optional(),
    NOTIFICATION_TIMEOUT_MS: posInt.default(10_000),
    NOTIFICATION_MAX_ATTEMPTS: posInt.max(10).default(3),

    // AI Advisor (Phase 10) — sans clé, l'advisor utilise le générateur
    // déterministe (`rules`). Aucun secret en dur.
    ANTHROPIC_API_KEY: optionalSecret,
    ADVISOR_MODEL: z.string().trim().min(1).default("claude-sonnet-5"),
    ADVISOR_MAX_TOKENS: posInt.max(4000).default(600),
    ADVISOR_TIMEOUT_MS: posInt.default(20_000),
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
      fixedRates: raw.FX_FIXED_RATES,
    },
    detection: {
      dropPct: raw.DROP_PCT,
      flashDropPct: raw.FLASH_DROP_PCT,
      flashDropAbsCents: raw.FLASH_DROP_ABS_EUR * 100,
      flashWindowMinutes: raw.FLASH_WINDOW_MINUTES,
      analyticsMinSample: raw.ANALYTICS_MIN_SAMPLE,
    },
    engine: {
      schedulerIntervalMs: raw.SCHEDULER_INTERVAL_MS,
      searchWorkerConcurrency: raw.SEARCH_WORKER_CONCURRENCY,
      combinationsPerRun: raw.SEARCH_COMBINATIONS_PER_RUN,
      providerMinIntervalSeconds: raw.PROVIDER_MIN_INTERVAL_SECONDS,
      radarBatchSize: raw.RADAR_BATCH_SIZE,
      mockScenario: raw.MOCK_SCENARIO,
    },
    providers: {
      fastFlights: raw.FAST_FLIGHTS_URL
        ? { url: raw.FAST_FLIGHTS_URL, timeoutMs: raw.FAST_FLIGHTS_TIMEOUT_MS }
        : null,
      serpapi: raw.SERPAPI_API_KEY
        ? {
            apiKey: raw.SERPAPI_API_KEY,
            timeoutMs: raw.SERPAPI_TIMEOUT_MS,
            maxDestinations: raw.SERPAPI_MAX_DESTINATIONS,
          }
        : null,
      duffel: raw.DUFFEL_API_TOKEN ? { token: raw.DUFFEL_API_TOKEN } : null,
    },
    notifications: {
      telegram:
        raw.TELEGRAM_BOT_TOKEN && raw.TELEGRAM_CHAT_ID
          ? { botToken: raw.TELEGRAM_BOT_TOKEN, chatId: raw.TELEGRAM_CHAT_ID }
          : null,
      email:
        raw.SMTP_URL && raw.EMAIL_FROM && raw.EMAIL_TO
          ? { smtpUrl: raw.SMTP_URL, from: raw.EMAIL_FROM, to: raw.EMAIL_TO }
          : null,
      webhook: raw.NOTIFICATION_WEBHOOK_URL ? { url: raw.NOTIFICATION_WEBHOOK_URL } : null,
      timeoutMs: raw.NOTIFICATION_TIMEOUT_MS,
      maxAttempts: raw.NOTIFICATION_MAX_ATTEMPTS,
    },
    advisor: {
      anthropic: raw.ANTHROPIC_API_KEY
        ? {
            apiKey: raw.ANTHROPIC_API_KEY,
            model: raw.ADVISOR_MODEL,
            maxTokens: raw.ADVISOR_MAX_TOKENS,
            timeoutMs: raw.ADVISOR_TIMEOUT_MS,
          }
        : null,
      model: raw.ADVISOR_MODEL,
    },
  }));

export type RawConfigInput = z.input<typeof configSchema>;
export type AppConfig = z.output<typeof configSchema>;
