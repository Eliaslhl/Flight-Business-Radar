import { type AppConfig } from "@fbr/config";
import { type ApiInstance } from "../types.js";

export interface NotificationRoutesDeps {
  readonly config: AppConfig;
}

/**
 * Expose l'état des canaux de notification (Phase 8) — **aucun secret** : juste
 * quels canaux sont configurés côté worker. Utile au dashboard `/settings`.
 */
export const registerNotificationRoutes = (
  app: ApiInstance,
  deps: NotificationRoutesDeps,
): void => {
  const n = deps.config.notifications;

  app.get("/api/notifications/channels", () => ({
    channels: [
      { name: "CONSOLE", configured: true },
      { name: "TELEGRAM", configured: n.telegram !== null },
      { name: "EMAIL", configured: n.email !== null },
      { name: "WEBHOOK", configured: n.webhook !== null },
    ],
    timeoutMs: n.timeoutMs,
    maxAttempts: n.maxAttempts,
  }));
};
