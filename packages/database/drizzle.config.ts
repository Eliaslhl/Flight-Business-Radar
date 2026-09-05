import { defineConfig } from "drizzle-kit";

/**
 * Config drizzle-kit (génération de migrations + studio).
 * `db:generate` n'ouvre pas de connexion ; `db:studio` / `push` utilisent
 * `DATABASE_URL`. Une valeur de repli locale évite l'échec de `generate` hors ligne.
 */
export default defineConfig({
  schema: "./src/schema/*.table.ts",
  out: "./drizzle",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://fbr:fbr@localhost:5432/fbr",
  },
});
