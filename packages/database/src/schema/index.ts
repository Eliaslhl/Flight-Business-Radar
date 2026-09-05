/**
 * Point d'entrée du schéma Drizzle pour le code applicatif.
 * Chaque table vit dans un fichier `*.table.ts` (convention : drizzle-kit
 * ne charge que ces fichiers, jamais ce barrel — voir `drizzle.config.ts`).
 */
export * from "./app-meta.table.js";
