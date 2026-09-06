/**
 * Noms des files BullMQ (Phase 0 §7). Seule `search` est utilisée en Phase 3.
 * BullMQ interdit `:` dans un nom de file (séparateur de clés Redis interne).
 */
export const QUEUE_NAMES = {
  search: "fbr-search",
  analyze: "fbr-analyze",
  confirm: "fbr-confirm",
  notify: "fbr-notify",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
