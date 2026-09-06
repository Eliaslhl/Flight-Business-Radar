import {
  buildAlertNotification,
  isInCooldown,
  isPriceConfirmed,
  matchAlerts,
  needsConfirmation,
  type AlertConfig,
  type AlertEventInput,
} from "@fbr/alerting";
import {
  insertNotification,
  listEnabledAlertsForSearch,
  markAlertTriggered,
  markPriceEventsConfirmed,
  notificationExists,
  updateSnapshotStatus,
  type Database,
  type InsertedPriceEvent,
  type NotificationRow,
  type SearchRow,
} from "@fbr/database";
import { type FlightOffer } from "@fbr/flight-domain";
import { type NotificationService } from "@fbr/notifications";
import { buildRequestForOffer } from "@fbr/search-engine";
import { LogEvent, type Logger } from "@fbr/shared";
import { type ConfirmFn } from "./confirmer.js";
import { toSearchLike } from "./mappers.js";

export interface AlertPipelineDeps {
  readonly db: Database;
  readonly logger: Logger;
  readonly notificationService: NotificationService;
  readonly confirm: ConfirmFn;
  /** Tolérance de confirmation (défaut 3 %). */
  readonly confirmationTolerance?: number;
}

export interface AlertPipelineResult {
  readonly alertsTriggered: number;
  readonly alertsSuppressed: number;
  readonly confirmationsFailed: number;
}

const ZERO: AlertPipelineResult = {
  alertsTriggered: 0,
  alertsSuppressed: 0,
  confirmationsFailed: 0,
};

/**
 * Pipeline d'alerte (Phase 5) : associe les `price_events` aux alertes activées,
 * applique cooldown + déduplication, **confirme** les prix exceptionnels via une
 * re-requête, puis diffuse et historise les notifications.
 */
export const runAlertPipeline = async (
  deps: AlertPipelineDeps,
  params: {
    search: SearchRow;
    detected: readonly InsertedPriceEvent[];
    offersById: ReadonlyMap<string, FlightOffer>;
    now: Date;
  },
): Promise<AlertPipelineResult> => {
  if (params.detected.length === 0) return ZERO;

  const alertRows = await listEnabledAlertsForSearch(deps.db, params.search.id);
  if (alertRows.length === 0) return ZERO;

  const alertConfigs: AlertConfig[] = alertRows.map((a) => ({
    id: a.id,
    type: a.type,
    thresholdEurCents: a.thresholdEurCents,
    enabled: true,
    cooldownSeconds: a.cooldownSeconds,
    lastTriggeredAt: a.lastTriggeredAt,
  }));
  const events: AlertEventInput[] = params.detected.map((e) => ({
    eventId: e.id,
    flightOfferId: e.flightOfferId,
    snapshotId: e.newSnapshotId,
    type: e.type,
    newPriceEurCents: e.newPriceEurCents,
    previousPriceEurCents: e.previousPriceEurCents,
    dropAmountEurCents: e.dropAmountEurCents,
    dropPct: e.dropPct,
  }));

  const searchLike = toSearchLike(params.search);
  const tolerance = deps.confirmationTolerance ?? 0.03;
  let alertsTriggered = 0;
  let alertsSuppressed = 0;
  let confirmationsFailed = 0;

  for (const match of matchAlerts(events, alertConfigs)) {
    if (isInCooldown(match.alert, params.now)) {
      deps.logger.debug(
        { event: "alert_cooldown", alertId: match.alert.id, searchId: params.search.id },
        "alerte en cooldown",
      );
      continue;
    }

    const offer = params.offersById.get(match.event.flightOfferId);
    if (!offer) {
      deps.logger.warn(
        { event: "alert_offer_missing", flightOfferId: match.event.flightOfferId },
        "offre absente du contexte d'alerte",
      );
      continue;
    }

    const notification = buildAlertNotification(match, {
      searchId: params.search.id,
      searchLabel: params.search.label,
      origin: offer.origin,
      destination: offer.destination,
      outboundDate: offer.outbound.departureDate,
      returnDate: offer.inbound?.departureDate ?? null,
      now: params.now,
    });

    if (await notificationExists(deps.db, notification.dedupeKey)) {
      alertsSuppressed += 1;
      continue;
    }

    if (needsConfirmation(match.alertType)) {
      const request = buildRequestForOffer(searchLike, {
        destination: offer.destination,
        outboundDate: offer.outbound.departureDate,
        returnDate: offer.inbound?.departureDate ?? null,
        tripDays: null,
      });
      const recheck = await deps.confirm(request);
      if (!isPriceConfirmed(match.event.newPriceEurCents, recheck, tolerance)) {
        await updateSnapshotStatus(deps.db, match.event.snapshotId, "EXPIRED");
        deps.logger.info(
          {
            event: LogEvent.PriceExpired,
            searchId: params.search.id,
            alertType: match.alertType,
            newPriceEurCents: match.event.newPriceEurCents,
          },
          "prix non confirmé — pas de notification",
        );
        confirmationsFailed += 1;
        continue;
      }
      await markPriceEventsConfirmed(deps.db, [match.event.eventId]);
      await updateSnapshotStatus(deps.db, match.event.snapshotId, "CONFIRMED");
      deps.logger.info(
        { event: LogEvent.PriceConfirmed, searchId: params.search.id, alertType: match.alertType },
        "prix confirmé",
      );
    }

    const results = await deps.notificationService.dispatch({
      type: notification.alertType,
      subject: notification.subject,
      body: notification.body,
      payload: notification.payload,
      dedupeKey: notification.dedupeKey,
    });

    for (const r of results) {
      await insertNotification(deps.db, {
        searchId: params.search.id,
        alertId: match.alert.id,
        priceEventId: match.event.eventId,
        channel: r.channel as NotificationRow["channel"],
        status: r.ok ? "SENT" : "FAILED",
        subject: notification.subject,
        body: notification.body,
        payload: notification.payload,
        dedupeKey: notification.dedupeKey,
        sentAt: r.ok ? params.now : null,
        error: r.error ?? null,
      });
    }

    await markAlertTriggered(deps.db, match.alert.id, params.now);
    alertsTriggered += 1;
    deps.logger.info(
      {
        event: LogEvent.AlertTriggered,
        searchId: params.search.id,
        alertId: match.alert.id,
        alertType: match.alertType,
        channels: results.map((r) => `${r.channel}:${r.ok ? "ok" : "fail"}`),
      },
      notification.subject,
    );
  }

  return { alertsTriggered, alertsSuppressed, confirmationsFailed };
};
