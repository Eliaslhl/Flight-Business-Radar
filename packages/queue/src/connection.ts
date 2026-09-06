import { Redis } from "ioredis";

/**
 * Connexion Redis pour BullMQ. `maxRetriesPerRequest: null` est **exigé** par
 * BullMQ (les blocking commands ne doivent pas expirer).
 */
export const createQueueConnection = (url: string): Redis =>
  new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

export type { Redis };
