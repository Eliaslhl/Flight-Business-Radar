import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createDatabase, runMigrations, type DbHandle } from "@fbr/database";

// Le `.env` vit à la racine du monorepo — le charger quel que soit le cwd de vitest.
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

/** Les tests d'intégration ne s'exécutent que si l'infra locale est disponible. */
export const hasDb = Boolean(process.env.DATABASE_URL);
export const hasRedis = Boolean(process.env.REDIS_URL);

// Verrou consultatif : sérialise les suites d'intégration entre processus
// (turbo lance `@fbr/api#test` et `@fbr/worker#test` en parallèle sur la même base).
const LOCK_KEY = 918_273_645;

let handle: DbHandle | undefined;
let lock: Awaited<ReturnType<DbHandle["sql"]["reserve"]>> | undefined;
let migrated = false;

export const getTestDb = async (): Promise<DbHandle> => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL requis pour les tests d'intégration");
  handle ??= createDatabase({ url, maxConnections: 4 });
  if (!lock) {
    lock = await handle.sql.reserve();
    await lock`SELECT pg_advisory_lock(${LOCK_KEY})`;
  }
  if (!migrated) {
    await runMigrations(handle);
    migrated = true;
  }
  return handle;
};

export const truncateAll = (h: DbHandle): Promise<unknown> =>
  h.sql`TRUNCATE provider_requests, price_snapshots, offer_provider_links, flight_offers, search_date_combinations, searches RESTART IDENTITY CASCADE`;

export const closeTestDb = async (): Promise<void> => {
  if (lock) {
    await lock`SELECT pg_advisory_unlock(${LOCK_KEY})`;
    lock.release();
    lock = undefined;
  }
  if (handle) {
    await handle.close();
    handle = undefined;
    migrated = false;
  }
};
