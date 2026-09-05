/**
 * Noms d'événements de logs structurés (cf. Phase 0 §24 — Observabilité).
 * Toujours logger via `logger.info({ event: LogEvent.PriceDetected, ... })`
 * pour garder des noms stables et requêtables.
 */
export const LogEvent = {
  AppStarted: "app_started",
  AppStopped: "app_stopped",
  ConfigLoaded: "config_loaded",

  SearchStarted: "search_started",
  SearchCompleted: "search_completed",

  ProviderRequest: "provider_request",
  ProviderResponse: "provider_response",
  ProviderError: "provider_error",

  PriceDetected: "price_detected",
  PriceDropDetected: "price_drop_detected",
  FlashDropDetected: "flash_drop_detected",
  PriceConfirmed: "price_confirmed",
  PriceExpired: "price_expired",

  AlertTriggered: "alert_triggered",
  NotificationSent: "notification_sent",
  NotificationFailed: "notification_failed",
} as const;

export type LogEventName = (typeof LogEvent)[keyof typeof LogEvent];
