import { defineWorkspace } from "vitest/config";

/**
 * Workspace Vitest : chaque package/app est testé dans son propre projet.
 * La condition de résolution "development" fait pointer les imports `@fbr/*`
 * vers `src/index.ts` (voir le champ `exports` de chaque package.json),
 * ce qui évite d'avoir à builder les packages avant de lancer les tests.
 */
export default defineWorkspace([
  {
    extends: false,
    resolve: {
      conditions: ["development", "import", "module", "node", "default"],
    },
    test: {
      name: "unit",
      include: ["packages/*/src/**/*.{test,spec}.ts", "apps/*/src/**/*.{test,spec}.ts"],
      environment: "node",
      clearMocks: true,
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        include: ["packages/*/src/**", "apps/*/src/**"],
        exclude: ["**/*.{test,spec}.ts", "**/index.ts", "**/*.d.ts"],
      },
    },
  },
]);
