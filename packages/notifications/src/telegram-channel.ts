import { type Logger } from "@fbr/shared";
import { deliverWithRetry } from "./deliver.js";
import { postJson, type FetchLike } from "./http.js";
import {
  type ChannelResult,
  type NotificationChannel,
  type OutboundNotification,
} from "./types.js";

export interface TelegramChannelOptions {
  readonly botToken: string;
  readonly chatId: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly logger?: Logger;
  readonly fetchImpl?: FetchLike;
}

const TELEGRAM_LIMIT = 4096;

/** Notification Telegram via l'API Bot (`sendMessage`). Gratuit, push-like. */
export class TelegramChannel implements NotificationChannel {
  readonly name = "TELEGRAM";
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly logger: Logger | undefined;
  private readonly fetchImpl: FetchLike;

  constructor(options: TelegramChannelOptions) {
    this.botToken = options.botToken;
    this.chatId = options.chatId;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  send(notification: OutboundNotification): Promise<ChannelResult> {
    const text = `${notification.subject}\n\n${notification.body}`.slice(0, TELEGRAM_LIMIT);
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    return deliverWithRetry(
      this.name,
      () =>
        postJson({
          url,
          body: { chat_id: this.chatId, text, disable_web_page_preview: true },
          timeoutMs: this.timeoutMs,
          fetchImpl: this.fetchImpl,
        }),
      { maxAttempts: this.maxAttempts, ...(this.logger ? { logger: this.logger } : {}) },
    );
  }
}
