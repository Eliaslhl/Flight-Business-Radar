import { type AppConfig } from "@fbr/config";
import {
  ConsoleChannel,
  EmailChannel,
  NotificationService,
  TelegramChannel,
  WebhookChannel,
  type NotificationChannel,
} from "@fbr/notifications";
import { type Logger } from "@fbr/shared";

/**
 * Construit le `NotificationService` du worker (Phase 8).
 * - `console` : toujours actif (logs structurés).
 * - `telegram` / `email` / `webhook` : activés uniquement quand LEUR config est
 *   complète dans `@fbr/config` — même logique de présence que les providers.
 * Ajouter un canal = une classe `NotificationChannel` + une ligne ici.
 */
export const buildNotificationService = (
  config: AppConfig,
  logger: Logger,
): NotificationService => {
  const n = config.notifications;
  const common = { timeoutMs: n.timeoutMs, maxAttempts: n.maxAttempts, logger };
  const channels: NotificationChannel[] = [new ConsoleChannel(logger)];

  if (n.telegram) {
    channels.push(new TelegramChannel({ ...n.telegram, ...common }));
  }
  if (n.email) {
    channels.push(new EmailChannel({ ...n.email, ...common }));
  }
  if (n.webhook) {
    channels.push(new WebhookChannel({ url: n.webhook.url, ...common }));
  }

  logger.info(
    { event: "notifications_configured", channels: channels.map((c) => c.name) },
    "canaux de notification actifs",
  );
  return new NotificationService({ channels, logger });
};
