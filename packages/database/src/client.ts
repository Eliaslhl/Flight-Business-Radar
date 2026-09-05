import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema/index.js";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  readonly db: Database;
  readonly sql: Sql;
  /** Ferme le pool de connexions. À appeler à l'arrêt du process. */
  close: () => Promise<void>;
}

export interface CreateDatabaseOptions {
  readonly url: string;
  /** Taille max du pool (défaut 10 ; 1 recommandé pour les migrations/tests). */
  readonly maxConnections?: number;
}

/**
 * Crée un handle de base de données (client `postgres.js` + Drizzle typé).
 * Aucune connexion n'est ouverte tant qu'une requête n'est pas exécutée.
 */
export const createDatabase = (options: CreateDatabaseOptions): DbHandle => {
  const sql = postgres(options.url, {
    max: options.maxConnections ?? 10,
    onnotice: () => {
      /* silence les NOTICE PostgreSQL */
    },
  });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
};

/** Ping simple : `SELECT 1`. Utilisé par le healthcheck de l'API. */
export const pingDatabase = async (handle: DbHandle): Promise<boolean> => {
  const rows = await handle.sql<{ ok: number }[]>`SELECT 1 AS ok`;
  return rows[0]?.ok === 1;
};
