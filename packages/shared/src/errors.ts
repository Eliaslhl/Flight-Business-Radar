/**
 * Hiérarchie d'erreurs applicative.
 *
 * - `AppError` : base, porte un `code` stable (pour logs/metrics) et un flag
 *   `retryable` exploité par les workers (retry / circuit breaker).
 * - Les sous-classes qualifient la nature de l'échec sans exposer de détail
 *   sensible dans le message.
 */
export type ErrorCode =
  | "CONFIG_INVALID"
  | "VALIDATION_FAILED"
  | "DATA_QUALITY_REJECTED"
  | "PROVIDER_ERROR"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export interface AppErrorOptions {
  readonly code: ErrorCode;
  readonly retryable?: boolean;
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly context: Record<string, unknown>;

  constructor(message: string, options: AppErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.context = options.context ?? {};
  }

  /** Représentation sûre pour les logs structurés (sans stack ni cause brute). */
  toLogObject(): Record<string, unknown> {
    return { name: this.name, code: this.code, retryable: this.retryable, ...this.context };
  }
}

export class ConfigError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { code: "CONFIG_INVALID", retryable: false, ...(context ? { context } : {}) });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: "VALIDATION_FAILED",
      retryable: false,
      ...(context ? { context } : {}),
    });
  }
}

export class DataQualityError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: "DATA_QUALITY_REJECTED",
      retryable: false,
      ...(context ? { context } : {}),
    });
  }
}

export class ProviderError extends AppError {
  constructor(
    message: string,
    options?: {
      code?: Extract<ErrorCode, `PROVIDER_${string}`>;
      retryable?: boolean;
      cause?: unknown;
      context?: Record<string, unknown>;
    },
  ) {
    super(message, {
      code: options?.code ?? "PROVIDER_ERROR",
      retryable: options?.retryable ?? true,
      ...(options?.cause !== undefined ? { cause: options.cause } : {}),
      ...(options?.context ? { context: options.context } : {}),
    });
  }
}

export const isAppError = (value: unknown): value is AppError => value instanceof AppError;

/** Normalise n'importe quelle valeur `catch` en `AppError`. */
export const toAppError = (value: unknown): AppError => {
  if (value instanceof AppError) return value;
  if (value instanceof Error) {
    return new AppError(value.message, { code: "INTERNAL", retryable: false, cause: value });
  }
  return new AppError("Unknown error", { code: "INTERNAL", retryable: false, context: { value } });
};
