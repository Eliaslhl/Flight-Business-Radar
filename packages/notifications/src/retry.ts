export interface RetryOptions {
  /** Nombre total de tentatives (défaut 3). */
  readonly attempts?: number;
  /** Délai de base, multiplié par le numéro de tentative (défaut 200 ms). */
  readonly baseDelayMs?: number;
  /** Sleep injectable (tests). */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Appelé avant chaque nouvelle tentative (observabilité). */
  readonly onRetry?: (info: { attempt: number; error: unknown }) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exécute `fn`, retente sur exception jusqu'à `attempts` fois avec un backoff
 * linéaire. Relance la dernière erreur si toutes les tentatives échouent.
 */
export const withRetry = async <T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 200;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        options.onRetry?.({ attempt, error });
        await sleep(baseDelayMs * attempt);
      }
    }
  }
  throw lastError;
};
