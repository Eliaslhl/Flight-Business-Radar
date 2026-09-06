import { createLogger } from "@fbr/shared";
import { createDatabase, MIGRATIONS_FOLDER, runMigrations } from "./client.js";

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

  const handle = createDatabase({ url, maxConnections: 1 });
  try {
    logger.info({ migrationsFolder: MIGRATIONS_FOLDER }, "application des migrations");
    await runMigrations(handle);
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
