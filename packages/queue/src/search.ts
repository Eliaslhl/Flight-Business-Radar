import {
  Queue,
  Worker,
  type ConnectionOptions,
  type Job,
  type Processor,
  type WorkerOptions,
} from "bullmq";
import { QUEUE_NAMES } from "./queues.js";

export const SEARCH_JOB_NAME = "search.run";

export interface SearchRunJobData {
  readonly searchId: string;
  readonly reason: "scheduled" | "manual";
}

export type SearchJob = Job<SearchRunJobData>;

export const createSearchQueue = (connection: ConnectionOptions): Queue<SearchRunJobData> =>
  new Queue<SearchRunJobData>(QUEUE_NAMES.search, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 2000 },
    },
  });

export interface EnqueueSearchRunOptions {
  /** Id de job explicite → déduplication (deux `add` avec le même id ⇒ un seul job). */
  readonly jobId?: string;
  readonly delayMs?: number;
}

export const enqueueSearchRun = (
  queue: Queue<SearchRunJobData>,
  data: SearchRunJobData,
  options: EnqueueSearchRunOptions = {},
): Promise<SearchJob> =>
  queue.add(SEARCH_JOB_NAME, data, {
    ...(options.jobId ? { jobId: options.jobId } : {}),
    ...(options.delayMs ? { delay: options.delayMs } : {}),
  });

export interface CreateSearchWorkerOptions {
  readonly connection: ConnectionOptions;
  readonly concurrency?: number;
  readonly extra?: Partial<WorkerOptions>;
}

export const createSearchWorker = (
  processor: Processor<SearchRunJobData>,
  options: CreateSearchWorkerOptions,
): Worker<SearchRunJobData> =>
  new Worker<SearchRunJobData>(QUEUE_NAMES.search, processor, {
    connection: options.connection,
    concurrency: options.concurrency ?? 4,
    ...options.extra,
  });
