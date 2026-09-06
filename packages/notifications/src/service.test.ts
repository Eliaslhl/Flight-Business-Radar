import { createSilentLogger } from "@fbr/shared";
import { describe, expect, it, vi } from "vitest";
import { ConsoleChannel } from "./console-channel.js";
import { NotificationService } from "./service.js";
import { type NotificationChannel, type OutboundNotification } from "./types.js";

const notif: OutboundNotification = {
  type: "FLASH_DROP",
  subject: "🚨 BAISSE FLASH",
  body: "CDG → HND 899 €",
  payload: { x: 1 },
  dedupeKey: "s1:FLASH_DROP:HND:2026-11-10:2026-09-06",
};

const okChannel = (name: string): NotificationChannel => ({
  name,
  send: vi.fn().mockResolvedValue({ channel: name, ok: true }),
});

const failingChannel = (name: string): NotificationChannel => ({
  name,
  send: vi.fn().mockRejectedValue(new Error("boom")),
});

describe("NotificationService", () => {
  it("diffuse sur tous les canaux et retourne un résultat par canal", async () => {
    const svc = new NotificationService({ channels: [okChannel("A"), okChannel("B")] });
    const results = await svc.dispatch(notif);
    expect(svc.channelNames).toEqual(["A", "B"]);
    expect(results).toEqual([
      { channel: "A", ok: true },
      { channel: "B", ok: true },
    ]);
  });

  it("un canal en échec n'empêche pas les autres", async () => {
    const svc = new NotificationService({
      channels: [failingChannel("KO"), okChannel("OK")],
      logger: createSilentLogger(),
    });
    const results = await svc.dispatch(notif);
    expect(results[0]).toMatchObject({ channel: "KO", ok: false, error: "boom" });
    expect(results[1]).toEqual({ channel: "OK", ok: true });
  });

  it("ConsoleChannel journalise et réussit toujours", async () => {
    const res = await new ConsoleChannel(createSilentLogger()).send(notif);
    expect(res).toEqual({ channel: "CONSOLE", ok: true });
  });
});
