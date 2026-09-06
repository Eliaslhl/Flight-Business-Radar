import { LogEvent, toAppError, type Logger } from "@fbr/shared";
import {
  type ChannelResult,
  type NotificationChannel,
  type OutboundNotification,
} from "./types.js";

export interface NotificationServiceOptions {
  readonly channels: readonly NotificationChannel[];
  readonly logger?: Logger;
}

/**
 * Diffuse une notification sur tous les canaux configurés. Un canal en échec
 * n'empêche jamais les autres (`Promise.allSettled`).
 */
export class NotificationService {
  private readonly channels: readonly NotificationChannel[];
  private readonly logger: Logger | undefined;

  constructor(options: NotificationServiceOptions) {
    this.channels = options.channels;
    this.logger = options.logger;
  }

  get channelNames(): string[] {
    return this.channels.map((c) => c.name);
  }

  async dispatch(notification: OutboundNotification): Promise<ChannelResult[]> {
    const settled = await Promise.allSettled(
      this.channels.map((channel) => channel.send(notification)),
    );
    return settled.map((result, i) => {
      const channel = this.channels[i]!.name;
      if (result.status === "fulfilled") return result.value;
      const error = toAppError(result.reason);
      this.logger?.warn(
        { event: LogEvent.NotificationFailed, channel, err: error.toLogObject() },
        "échec d'envoi de notification",
      );
      return { channel, ok: false, error: error.message };
    });
  }
}
