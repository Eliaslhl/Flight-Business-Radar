export interface OutboundNotification {
  readonly type: string;
  readonly subject: string;
  readonly body: string;
  readonly payload: Record<string, unknown>;
  readonly dedupeKey: string;
}

export interface ChannelResult {
  readonly channel: string;
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Canal de notification (Phase 0 §16). Ajouter Email / Telegram / Discord se
 * fait en implémentant cette interface, sans toucher au moteur de prix.
 */
export interface NotificationChannel {
  readonly name: string;
  send(notification: OutboundNotification): Promise<ChannelResult>;
}
