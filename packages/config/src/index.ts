import { ConfigError } from "@fbr/shared";
import { configSchema, type AppConfig } from "./schema.js";

export type { AppConfig } from "./schema.js";
export { configSchema } from "./schema.js";

let cached: AppConfig | undefined;

/**
 * Charge et valide la configuration depuis `source` (par défaut `process.env`).
 * Fail-fast : lève `ConfigError` avec la liste des variables invalides, sans
 * jamais logguer leur valeur.
 */
export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = configSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join(".") || "(root)",
      message: i.message,
    }));
    throw new ConfigError("Configuration invalide", { issues });
  }
  return parsed.data;
};

/** Singleton : valide une seule fois par process. */
export const getConfig = (): AppConfig => {
  cached ??= loadConfig();
  return cached;
};

/** Réinitialise le cache — réservé aux tests. */
export const resetConfigCache = (): void => {
  cached = undefined;
};
