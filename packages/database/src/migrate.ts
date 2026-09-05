import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createLogger } from "@fbr/shared";
import { createDatabase } from "./client.js";

/**
 * Applique les migrations SQL de `packages/database/drizzle/` à la base
 * pointée par `DATABASE_URL`. Idempotent (drizzle tient un journal).
 */
const main = async (): Promise<void> => {
  const logger = createLogger({ name: "db-migrate", pretty: true });
  const url = process.env.DATABASE_URL;
  if (!url) {
    logger.error("DATABASE_URL manquant");
    process.exit(1);
  }

  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");
  const handle = createDatabase({ url, maxConnections: 1 });
  try {
    logger.info({ migrationsFolder }, "application des migrations");
    await migrate(handle.db, { migrationsFolder });
    logger.info("migrations appliquées");
  } finally {
    await handle.close();
  }
};

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
