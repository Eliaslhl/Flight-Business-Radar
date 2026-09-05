import { pino, type Logger, type LoggerOptions } from "pino";

export type { Logger };

export interface CreateLoggerOptions {
  /** Nom du service (api, worker, scheduler…). Ajouté à chaque ligne. */
  readonly name: string;
  readonly level?: string;
  /** true → sortie colorée lisible (dev). false → JSON structuré (prod). */
  readonly pretty?: boolean;
}

// pino : une clé sans point ne cible que la racine, `*.x` ne cible que la
// profondeur 2. On liste donc les deux formes pour les secrets courants.
const SECRET_KEYS = [
  "apiKey",
  "api_key",
  "token",
  "password",
  "authorization",
  "DATABASE_URL",
  "REDIS_URL",
  "SERPAPI_API_KEY",
  "DUFFEL_API_TOKEN",
  "TELEGRAM_BOT_TOKEN",
];

const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  ...SECRET_KEYS,
  ...SECRET_KEYS.map((key) => `*.${key}`),
];

/**
 * Crée un logger pino avec redaction des secrets et un champ `service`.
 * Les logs ne doivent jamais contenir de données sensibles (Phase 0 §23).
 */
export const createLogger = (options: CreateLoggerOptions): Logger => {
  const base: LoggerOptions = {
    name: options.name,
    level: options.level ?? "info",
    base: { service: options.name },
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (options.pretty) {
    return pino({
      ...base,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
      },
    });
  }

  return pino(base);
};

/** Logger silencieux pour les tests. */
export const createSilentLogger = (): Logger => pino({ level: "silent" });
