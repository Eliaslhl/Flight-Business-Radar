import { type Logger } from "@fbr/shared";
import { deliverWithRetry } from "./deliver.js";
import { postJson, type FetchLike } from "./http.js";
import {
  type ChannelResult,
  type NotificationChannel,
  type OutboundNotification,
} from "./types.js";

export interface WebhookChannelOptions {
  readonly url: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly logger?: Logger;
  readonly fetchImpl?: FetchLike;
}

/**
 * Webhook générique : POST JSON de la notification. Compatible Discord
 * (`content`), Slack / ntfy (`text`) et tout consommateur maison (champs
 * structurés). Aucun secret : l'URL elle-même porte le jeton.
 */
export class WebhookChannel implements NotificationChannel {
  readonly name = "WEBHOOK";
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly logger: Logger | undefined;
  private readonly fetchImpl: FetchLike;

  constructor(options: WebhookChannelOptions) {
    this.url = options.url;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  send(notification: OutboundNotification): Promise<ChannelResult> {
    const text = `${notification.subject}\n\n${notification.body}`;
    return deliverWithRetry(
      this.name,
      () =>
        postJson({
          url: this.url,
          body: {
            content: text, // Discord
            text, // Slack / ntfy
            type: notification.type,
            subject: notification.subject,
            body: notification.body,
            dedupeKey: notification.dedupeKey,
            payload: notification.payload,
          },
          timeoutMs: this.timeoutMs,
          fetchImpl: this.fetchImpl,
        }),
      { maxAttempts: this.maxAttempts, ...(this.logger ? { logger: this.logger } : {}) },
    );
  }
}
