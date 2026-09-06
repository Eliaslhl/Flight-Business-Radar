/**
 * Point d'entrée du schéma Drizzle pour le code applicatif.
 * Les tables vivent dans des fichiers `*.table.ts` (drizzle-kit ne charge que
 * ceux-là, jamais ce barrel — voir `drizzle.config.ts`).
 */
export * from "./app-meta.table.js";
export * from "./core.table.js";
