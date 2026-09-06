import { describe, expect, it } from "vitest";
import { cooldownRemainingSeconds, isInCooldown } from "./cooldown.js";
import { isPriceConfirmed, needsConfirmation } from "./confirmation.js";
import { matchAlerts } from "./evaluate.js";
import { buildAlertNotification } from "./notification.js";
import { type AlertConfig, type AlertEventInput } from "./types.js";

const alert = (over: Partial<AlertConfig> = {}): AlertConfig => ({
  id: "a1",
  type: "FLASH_DROP",
  thresholdEurCents: null,
  enabled: true,
  cooldownSeconds: 3600,
  lastTriggeredAt: null,
  ...over,
});

const event = (over: Partial<AlertEventInput> = {}): AlertEventInput => ({
  eventId: "e1",
  flightOfferId: "o1",
  snapshotId: 10,
  type: "FLASH_DROP",
  newPriceEurCents: 89_900,
  previousPriceEurCents: 142_000,
  dropAmountEurCents: 52_100,
  dropPct: 0.367,
  ...over,
});

describe("matchAlerts", () => {
  it("route les types d'événement vers les bons types d'alerte", () => {
    const alerts = [
      alert({ id: "flash", type: "FLASH_DROP" }),
      alert({ id: "drop", type: "PRICE_DROP" }),
      alert({ id: "target", type: "TARGET_PRICE" }),
      alert({ id: "record", type: "RECORD_LOW" }),
    ];
    const matches = matchAlerts(
      [event({ type: "FLASH_DROP" }), event({ eventId: "e2", type: "TARGET_HIT" })],
      alerts,
    );
    const byAlert = Object.fromEntries(matches.map((m) => [m.alert.id, m.event.type]));
    expect(byAlert.flash).toBe("FLASH_DROP");
    expect(byAlert.drop).toBe("FLASH_DROP"); // FLASH_DROP alimente aussi PRICE_DROP
    expect(byAlert.target).toBe("TARGET_HIT");
    expect(byAlert.record).toBeUndefined();
  });

  it("un seul match par alerte : l'événement le plus fort gagne", () => {
    const [m] = matchAlerts(
      [event({ type: "DROP", dropPct: 0.06 }), event({ eventId: "e2", type: "FLASH_DROP" })],
      [alert({ id: "drop", type: "PRICE_DROP" })],
    );
    expect(m?.event.type).toBe("FLASH_DROP");
  });

  it("respecte le seuil (plafond de prix) pour TARGET_PRICE / RECORD_LOW", () => {
    const a = alert({ id: "t", type: "TARGET_PRICE", thresholdEurCents: 120_000 });
    expect(
      matchAlerts([event({ type: "TARGET_HIT", newPriceEurCents: 125_000 })], [a]),
    ).toHaveLength(0);
    expect(
      matchAlerts([event({ type: "TARGET_HIT", newPriceEurCents: 118_000 })], [a]),
    ).toHaveLength(1);
  });

  it("ignore les alertes désactivées", () => {
    expect(matchAlerts([event()], [alert({ enabled: false })])).toHaveLength(0);
  });
});

describe("cooldown", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("prête si jamais déclenchée", () => {
    expect(isInCooldown({ cooldownSeconds: 3600, lastTriggeredAt: null }, now)).toBe(false);
  });
  it("en refroidissement puis prête", () => {
    const recent = new Date(now.getTime() - 600_000); // 10 min
    expect(isInCooldown({ cooldownSeconds: 3600, lastTriggeredAt: recent }, now)).toBe(true);
    expect(cooldownRemainingSeconds({ cooldownSeconds: 3600, lastTriggeredAt: recent }, now)).toBe(
      3000,
    );
    const old = new Date(now.getTime() - 4000_000);
    expect(isInCooldown({ cooldownSeconds: 3600, lastTriggeredAt: old }, now)).toBe(false);
  });
});

describe("confirmation", () => {
  it("FLASH_DROP / RECORD_LOW / UNUSUAL_PRICE requièrent confirmation, pas PRICE_DROP", () => {
    expect(needsConfirmation("FLASH_DROP")).toBe(true);
    expect(needsConfirmation("RECORD_LOW")).toBe(true);
    expect(needsConfirmation("UNUSUAL_PRICE")).toBe(true);
    expect(needsConfirmation("PRICE_DROP")).toBe(false);
    expect(needsConfirmation("TARGET_PRICE")).toBe(false);
  });

  it("isPriceConfirmed exige une offre disponible sous le prix (± tolérance)", () => {
    expect(isPriceConfirmed(90_000, [{ priceEurCents: 91_000, availability: "AVAILABLE" }])).toBe(
      true,
    );
    expect(isPriceConfirmed(90_000, [{ priceEurCents: 120_000, availability: "AVAILABLE" }])).toBe(
      false,
    );
    expect(isPriceConfirmed(90_000, [{ priceEurCents: 89_000, availability: "WAITLIST" }])).toBe(
      false,
    );
    expect(isPriceConfirmed(90_000, [])).toBe(false);
  });
});

describe("buildAlertNotification", () => {
  const ctx = {
    searchId: "s1",
    searchLabel: "CDG → Tokyo",
    origin: "CDG",
    destination: "HND",
    outboundDate: "2026-11-10",
    returnDate: "2026-11-20",
    now: new Date("2026-09-06T08:00:00Z"),
  };

  it("produit sujet, corps et clé d'idempotence stable par jour", () => {
    const [m] = matchAlerts([event()], [alert({ id: "flash", type: "FLASH_DROP" })]);
    const n = buildAlertNotification(m!, ctx);
    expect(n.subject).toContain("FLASH");
    expect(n.body).toContain("CDG → HND");
    expect(n.body).toContain("€");
    expect(n.dedupeKey).toBe("s1:FLASH_DROP:HND:2026-11-10:2026-09-06");
    expect(n.payload.newPriceEurCents).toBe(89_900);
  });
});
