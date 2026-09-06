import { type AlertMatch } from "./evaluate.js";
import { type AlertType } from "./types.js";

export interface NotificationContext {
  readonly searchId: string;
  readonly searchLabel: string | null;
  readonly origin: string;
  readonly destination: string;
  readonly outboundDate: string;
  readonly returnDate: string | null;
  readonly now: Date;
}

export interface AlertNotification {
  readonly alertType: AlertType;
  readonly subject: string;
  readonly body: string;
  /** Clé d'idempotence : une notification par (recherche, type, route) et par jour. */
  readonly dedupeKey: string;
  readonly payload: Record<string, unknown>;
}

const formatEur = (cents: number): string =>
  (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

const SUBJECT: Record<AlertType, string> = {
  TARGET_PRICE: "🎯 Prix cible atteint",
  PRICE_DROP: "📉 Baisse de prix",
  FLASH_DROP: "🚨 BAISSE FLASH",
  RECORD_LOW: "🏆 Nouveau prix minimum",
  UNUSUAL_PRICE: "✨ Prix inhabituel",
};

const buildBody = (match: AlertMatch, ctx: NotificationContext): string => {
  const { event, alertType } = match;
  const route = `${ctx.origin} → ${ctx.destination}`;
  const dates = ctx.returnDate ? `${ctx.outboundDate} → ${ctx.returnDate}` : ctx.outboundDate;
  const price = formatEur(event.newPriceEurCents);
  const from = event.previousPriceEurCents !== null ? formatEur(event.previousPriceEurCents) : null;
  const pct = event.dropPct !== null ? `${Math.round(Math.abs(event.dropPct) * 100)} %` : null;

  switch (alertType) {
    case "FLASH_DROP":
      return `${route}\n${dates}\n\n${from ?? "?"} → ${price}${pct ? `  (-${pct})` : ""}\n\nPrix exceptionnel détecté — vérifie vite.`;
    case "PRICE_DROP":
      return `${route}\n${dates}\n\n${from ?? "?"} → ${price}${pct ? `  (-${pct})` : ""}`;
    case "TARGET_PRICE":
      return `${route}\n${dates}\n\nPrix : ${price}\n🎯 Ta cible est atteinte.`;
    case "RECORD_LOW":
      return `${route}\n${dates}\n\n${price}\nPlus bas prix observé sur cette recherche.`;
    case "UNUSUAL_PRICE":
      return `${route}\n${dates}\n\n${price}\nNettement sous les prix habituels.`;
  }
};

/** Construit la notification (sujet + corps + clé d'idempotence) pour un match. */
export const buildAlertNotification = (
  match: AlertMatch,
  ctx: NotificationContext,
): AlertNotification => {
  const day = ctx.now.toISOString().slice(0, 10);
  return {
    alertType: match.alertType,
    subject: SUBJECT[match.alertType],
    body: buildBody(match, ctx),
    dedupeKey: `${ctx.searchId}:${match.alertType}:${ctx.destination}:${ctx.outboundDate}:${day}`,
    payload: {
      searchId: ctx.searchId,
      searchLabel: ctx.searchLabel,
      alertId: match.alert.id,
      eventId: match.event.eventId,
      flightOfferId: match.event.flightOfferId,
      alertType: match.alertType,
      newPriceEurCents: match.event.newPriceEurCents,
      previousPriceEurCents: match.event.previousPriceEurCents,
      dropPct: match.event.dropPct,
      origin: ctx.origin,
      destination: ctx.destination,
      outboundDate: ctx.outboundDate,
      returnDate: ctx.returnDate,
    },
  };
};
