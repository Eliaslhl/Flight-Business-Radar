import { type PriceEventType } from "@fbr/analytics";

export const ALERT_TYPES = [
  "TARGET_PRICE",
  "PRICE_DROP",
  "FLASH_DROP",
  "RECORD_LOW",
  "UNUSUAL_PRICE",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export const isAlertType = (value: unknown): value is AlertType =>
  typeof value === "string" && (ALERT_TYPES as readonly string[]).includes(value);

export interface AlertConfig {
  readonly id: string;
  readonly type: AlertType;
  /** Plafond de prix (centimes EUR) pour `TARGET_PRICE` / `RECORD_LOW`. */
  readonly thresholdEurCents: number | null;
  readonly enabled: boolean;
  readonly cooldownSeconds: number;
  readonly lastTriggeredAt: Date | null;
}

/** Événement de prix (issu de `@fbr/analytics`) tel qu'il arrive au moteur d'alerte. */
export interface AlertEventInput {
  readonly eventId: string;
  readonly flightOfferId: string;
  readonly snapshotId: number;
  readonly type: PriceEventType;
  readonly newPriceEurCents: number;
  readonly previousPriceEurCents: number | null;
  readonly dropAmountEurCents: number | null;
  readonly dropPct: number | null;
}
