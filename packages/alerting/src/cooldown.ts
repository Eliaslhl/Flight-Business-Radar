export interface CooldownState {
  readonly cooldownSeconds: number;
  readonly lastTriggeredAt: Date | null;
}

/** Secondes restantes avant que l'alerte puisse se redéclencher (0 si prête). */
export const cooldownRemainingSeconds = (state: CooldownState, now: Date): number => {
  if (state.lastTriggeredAt === null || state.cooldownSeconds <= 0) return 0;
  const elapsed = (now.getTime() - state.lastTriggeredAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(state.cooldownSeconds - elapsed));
};

/** `true` si l'alerte est encore en période de refroidissement (anti-spam, Phase 0 §16). */
export const isInCooldown = (state: CooldownState, now: Date): boolean =>
  cooldownRemainingSeconds(state, now) > 0;
