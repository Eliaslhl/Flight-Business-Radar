/**
 * Scénarios déterministes du `MockFlightProvider` (Phase 0 §33/§34).
 * Permettent de tester tout le pipeline sans API externe.
 */
export const MOCK_SCENARIOS = [
  "normal", // prix stable (± bruit léger déterministe)
  "gradual-drop", // baisse progressive à chaque appel
  "flash-drop", // 1420 → 1350 → 1190 → 899 → 1420 puis stable
  "record-low", // nouveau plus-bas à chaque appel
  "unavailable", // offre renvoyée mais non disponible (WAITLIST, 0 siège)
  "error", // le provider lève une ProviderError
  "timeout", // le provider lève une ProviderError PROVIDER_TIMEOUT
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export const isMockScenario = (value: unknown): value is MockScenario =>
  typeof value === "string" && (MOCK_SCENARIOS as readonly string[]).includes(value);

/** PRNG déterministe (mulberry32) — bruit reproductible pour le scénario `normal`. */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

// 1420 → 1350 → 1190 → 899 → 1420 (ratios relatifs au prix de base).
const FLASH_RATIOS = [1, 0.9507, 0.838, 0.6331, 1] as const;

/**
 * Prix (en centimes) pour un scénario donné, au `callIndex`-ième appel (0-based).
 * `rng` n'est consommé que par le scénario `normal`.
 */
export const scenarioPriceCents = (
  scenario: MockScenario,
  callIndex: number,
  basePriceCents: number,
  rng: () => number,
): number => {
  const ratio = ((): number => {
    switch (scenario) {
      case "normal":
        return 1 + (rng() - 0.5) * 0.02;
      case "gradual-drop":
        return Math.max(0.5, 1 - 0.04 * callIndex);
      case "flash-drop":
        return FLASH_RATIOS[Math.min(callIndex, FLASH_RATIOS.length - 1)] ?? 1;
      case "record-low":
        return Math.max(0.35, 0.7 - 0.03 * callIndex);
      case "unavailable":
      case "error":
      case "timeout":
        return 1;
    }
  })();
  return Math.round(basePriceCents * ratio);
};
