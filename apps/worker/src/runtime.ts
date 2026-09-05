import { LogEvent, type Logger } from "@fbr/shared";

export interface WorkerRuntimeOptions {
  readonly logger: Logger;
  /**
   * Intervalle du heartbeat en ms. En Phase 3 ce runtime hébergera le
   * scheduler + les workers BullMQ ; pour l'instant il ne fait qu'un
   * battement de cœur prouvant que le process vit et s'arrête proprement.
   */
  readonly heartbeatMs?: number;
}

export interface WorkerRuntime {
  start: () => void;
  stop: () => Promise<void>;
  readonly isRunning: boolean;
}

export const createWorkerRuntime = (options: WorkerRuntimeOptions): WorkerRuntime => {
  const { logger } = options;
  const heartbeatMs = options.heartbeatMs ?? 30_000;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let beats = 0;

  return {
    get isRunning() {
      return running;
    },

    start() {
      if (running) return;
      running = true;
      logger.info({ event: LogEvent.AppStarted, heartbeatMs }, "worker démarré");
      timer = setInterval(() => {
        beats += 1;
        logger.debug({ event: "worker_heartbeat", beats }, "heartbeat");
      }, heartbeatMs);
      // Ne pas maintenir l'event loop actif uniquement pour le heartbeat.
      timer.unref();
    },

    async stop() {
      if (!running) return;
      running = false;
      if (timer) clearInterval(timer);
      timer = undefined;
      logger.info({ event: LogEvent.AppStopped, beats }, "worker arrêté");
      await Promise.resolve();
    },
  };
};
