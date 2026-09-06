import { listDueSearches, updateSearchSchedule, type Database } from "@fbr/database";
import { enqueueSearchRun, type Queue, type SearchRunJobData } from "@fbr/queue";
import { type Logger } from "@fbr/shared";

export interface SchedulerDeps {
  readonly db: Database;
  readonly queue: Queue<SearchRunJobData>;
  readonly logger: Logger;
  /** Période de scan des recherches dues. */
  readonly intervalMs: number;
  /** Bail court posé sur `next_run_at` à l'enqueue pour éviter les doublons. */
  readonly leaseSeconds?: number;
  readonly now?: () => Date;
}

export interface Scheduler {
  start: () => void;
  stop: () => Promise<void>;
  /** Exécute un scan immédiatement (utilisé par les tests). */
  tick: () => Promise<number>;
  readonly isRunning: boolean;
}

/**
 * Scanne périodiquement les recherches actives dont l'échéance est atteinte et
 * enfile un job `search.run`. Pose un bail court sur `next_run_at` pour ne pas
 * ré-enfiler la même recherche avant que le worker n'ait recalculé sa cadence.
 */
export const createScheduler = (deps: SchedulerDeps): Scheduler => {
  const now = deps.now ?? ((): Date => new Date());
  const leaseSeconds = deps.leaseSeconds ?? 120;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let ticking = false;

  const tick = async (): Promise<number> => {
    if (ticking) return 0;
    ticking = true;
    try {
      const at = now();
      const due = await listDueSearches(deps.db, at, 100);
      for (const search of due) {
        await enqueueSearchRun(
          deps.queue,
          { searchId: search.id, reason: "scheduled" },
          { jobId: `sched:${search.id}:${search.nextRunAt.getTime()}` },
        );
        await updateSearchSchedule(deps.db, search.id, {
          nextRunAt: new Date(at.getTime() + leaseSeconds * 1000),
        });
      }
      if (due.length > 0) {
        deps.logger.info(
          { event: "scheduler_enqueued", count: due.length },
          "recherches dues enfilées",
        );
      }
      return due.length;
    } catch (error) {
      deps.logger.error({ err: error, event: "scheduler_tick_failed" }, "échec du scan scheduler");
      return 0;
    } finally {
      ticking = false;
    }
  };

  return {
    get isRunning() {
      return running;
    },
    tick,
    start() {
      if (running) return;
      running = true;
      timer = setInterval(() => {
        void tick();
      }, deps.intervalMs);
      deps.logger.info(
        { event: "scheduler_started", intervalMs: deps.intervalMs },
        "scheduler démarré",
      );
    },
    async stop() {
      running = false;
      if (timer) clearInterval(timer);
      timer = undefined;
      // Laisse un tick en cours se terminer.
      for (let i = 0; i < 50 && ticking; i += 1) {
        await new Promise((r) => setTimeout(r, 20));
      }
    },
  };
};
