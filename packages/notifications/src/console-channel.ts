import { LogEvent, type Logger } from "@fbr/shared";
import {
  type ChannelResult,
  type NotificationChannel,
  type OutboundNotification,
} from "./types.js";

/** Canal par défaut : écrit la notification dans les logs structurés. */
export class ConsoleChannel implements NotificationChannel {
  readonly name = "CONSOLE";
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  send(notification: OutboundNotification): Promise<ChannelResult> {
    this.logger.info(
      {
        event: LogEvent.NotificationSent,
        channel: this.name,
        type: notification.type,
        subject: notification.subject,
        dedupeKey: notification.dedupeKey,
      },
      notification.body,
    );
    return Promise.resolve({ channel: this.name, ok: true });
  }
}
