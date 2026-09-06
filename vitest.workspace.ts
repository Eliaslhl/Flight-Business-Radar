import { defineWorkspace } from "vitest/config";

/**
 * Deux projets :
 *  - `unit`        : rapide, parallèle, sans dépendance externe.
 *  - `integration` : fichiers `*.int.test.ts` (Postgres/Redis) — exécutés en
 *    **série** car ils partagent la même base (truncate entre les tests).
 *
 * La condition de résolution "development" fait pointer les imports `@fbr/*`
 * vers les sources (voir le champ `exports` de chaque package.json).
 */
const resolve = {
  conditions: ["development", "import", "module", "node", "default"],
};

export default defineWorkspace([
  {
    extends: false,
    resolve,
    test: {
      name: "unit",
      include: ["packages/*/src/**/*.{test,spec}.ts", "apps/*/src/**/*.{test,spec}.ts"],
      exclude: ["**/*.int.test.ts", "**/node_modules/**", "**/dist/**"],
      environment: "node",
      clearMocks: true,
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        include: ["packages/*/src/**", "apps/*/src/**"],
        exclude: ["**/*.{test,spec}.ts", "**/index.ts", "**/*.d.ts", "**/it-support.ts"],
      },
    },
  },
  {
    extends: false,
    resolve,
    test: {
      name: "integration",
      include: ["apps/*/src/**/*.int.test.ts", "packages/*/src/**/*.int.test.ts"],
      environment: "node",
      clearMocks: true,
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  },
]);
