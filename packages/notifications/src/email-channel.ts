import { createTransport } from "nodemailer";
import { type Logger } from "@fbr/shared";
import { deliverWithRetry } from "./deliver.js";
import {
  type ChannelResult,
  type NotificationChannel,
  type OutboundNotification,
} from "./types.js";

export interface MailMessage {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Sous-ensemble de `nodemailer.Transporter` dont ce canal a besoin (testable). */
export interface MailTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

export interface EmailChannelOptions {
  /** SMTP unique, ex. `smtp://user:pass@host:587`. */
  readonly smtpUrl: string;
  readonly from: string;
  readonly to: string;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly logger?: Logger;
  /** Transport injecté (tests) — sinon `nodemailer` est créé à la volée. */
  readonly transport?: MailTransport;
}

/** Notification email via SMTP (`nodemailer`). Fonctionne avec n'importe quel
 * relai — MailHog local en dev, relai du fournisseur en prod. */
export class EmailChannel implements NotificationChannel {
  readonly name = "EMAIL";
  private readonly smtpUrl: string;
  private readonly from: string;
  private readonly to: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly logger: Logger | undefined;
  private transport: MailTransport | undefined;

  constructor(options: EmailChannelOptions) {
    this.smtpUrl = options.smtpUrl;
    this.from = options.from;
    this.to = options.to;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.logger = options.logger;
    this.transport = options.transport;
  }

  private getTransport(): MailTransport {
    if (!this.transport) {
      const t = createTransport(this.smtpUrl, {
        connectionTimeout: this.timeoutMs,
        greetingTimeout: this.timeoutMs,
        socketTimeout: this.timeoutMs,
      });
      this.transport = { sendMail: (message) => t.sendMail(message) };
    }
    return this.transport;
  }

  send(notification: OutboundNotification): Promise<ChannelResult> {
    return deliverWithRetry(
      this.name,
      async () => {
        await this.getTransport().sendMail({
          from: this.from,
          to: this.to,
          subject: notification.subject,
          text: notification.body,
        });
      },
      { maxAttempts: this.maxAttempts, ...(this.logger ? { logger: this.logger } : {}) },
    );
  }
}
