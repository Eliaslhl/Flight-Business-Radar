import { type PriceEventType } from "@fbr/analytics";
import { type AlertConfig, type AlertEventInput, type AlertType } from "./types.js";

/** Types d'événement qui peuvent déclencher chaque type d'alerte. */
const EVENT_TO_ALERTS: Partial<Record<PriceEventType, AlertType[]>> = {
  TARGET_HIT: ["TARGET_PRICE"],
  DROP: ["PRICE_DROP"],
  FLASH_DROP: ["FLASH_DROP", "PRICE_DROP"],
  RECORD_LOW: ["RECORD_LOW"],
  UNUSUAL: ["UNUSUAL_PRICE"],
};

/** Force d'un événement — départage quand plusieurs événements visent la même alerte. */
const EVENT_STRENGTH: Record<PriceEventType, number> = {
  FLASH_DROP: 5,
  RECORD_LOW: 4,
  UNUSUAL: 3,
  TARGET_HIT: 2,
  DROP: 1,
  RISE: 0,
  RECORD_HIGH: 0,
};

export interface AlertMatch {
  readonly alert: AlertConfig;
  readonly event: AlertEventInput;
  readonly alertType: AlertType;
}

const passesThreshold = (alert: AlertConfig, event: AlertEventInput): boolean => {
  if (alert.thresholdEurCents === null) return true;
  // Le seuil est un plafond de prix : l'alerte ne se déclenche qu'en dessous.
  if (alert.type === "TARGET_PRICE" || alert.type === "RECORD_LOW") {
    return event.newPriceEurCents <= alert.thresholdEurCents;
  }
  return true;
};

/**
 * Associe des événements de prix aux alertes configurées. Au plus **un** match
 * par alerte (l'événement le plus fort). Ne gère ni cooldown ni confirmation
 * (voir `isInCooldown` / `needsConfirmation`).
 */
export const matchAlerts = (
  events: readonly AlertEventInput[],
  alerts: readonly AlertConfig[],
): AlertMatch[] => {
  const bestByAlert = new Map<string, AlertMatch>();

  for (const alert of alerts) {
    if (!alert.enabled) continue;
    for (const event of events) {
      const candidates = EVENT_TO_ALERTS[event.type] ?? [];
      if (!candidates.includes(alert.type)) continue;
      if (!passesThreshold(alert, event)) continue;

      const current = bestByAlert.get(alert.id);
      if (!current || EVENT_STRENGTH[event.type] > EVENT_STRENGTH[current.event.type]) {
        bestByAlert.set(alert.id, { alert, event, alertType: alert.type });
      }
    }
  }

  return [...bestByAlert.values()];
};
