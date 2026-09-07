import { LogEvent, type Logger } from "@fbr/shared";
import { withRetry } from "./retry.js";
import { type ChannelResult } from "./types.js";

/**
 * Enveloppe commune aux canaux réseau : retente `send` (`withRetry`), journalise
 * chaque nouvelle tentative, et convertit le résultat en `ChannelResult` — un
 * échec final n'est jamais propagé (l'outbox l'historise en `FAILED`).
 */
export const deliverWithRetry = async (
  channel: string,
  send: () => Promise<void>,
  options: { maxAttempts: number; logger?: Logger },
): Promise<ChannelResult> => {
  try {
    await withRetry(send, {
      attempts: options.maxAttempts,
      onRetry: ({ attempt, error }) =>
        options.logger?.warn(
          { event: LogEvent.NotificationFailed, channel, attempt, err: String(error) },
          `${channel} — nouvelle tentative`,
        ),
    });
    return { channel, ok: true };
  } catch (error) {
    return {
      channel,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
