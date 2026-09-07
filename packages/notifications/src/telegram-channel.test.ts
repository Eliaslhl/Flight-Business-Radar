import { describe, expect, it, vi } from "vitest";
import { TelegramChannel } from "./telegram-channel.js";
import { type FetchLike } from "./http.js";
import { type OutboundNotification } from "./types.js";

const notif: OutboundNotification = {
  type: "FLASH_DROP",
  subject: "🚨 BAISSE FLASH",
  body: "CDG → HND\n2026-11-10 → 2026-11-20\n\n1 420 € → 899 €  (-37 %)",
  payload: { newPriceEurCents: 89_900 },
  dedupeKey: "s1:FLASH_DROP:HND:2026-11-10:2026-09-06",
};

const ok: FetchLike = () =>
  Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("") });

describe("TelegramChannel", () => {
  it("POST sendMessage avec chat_id + texte, renvoie ok", async () => {
    const fetchImpl = vi.fn(ok);
    const res = await new TelegramChannel({
      botToken: "TOK",
      chatId: "-100999",
      fetchImpl,
      maxAttempts: 1,
    }).send(notif);

    expect(res).toEqual({ channel: "TELEGRAM", ok: true });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/botTOK/sendMessage");
    const body = JSON.parse(init.body) as { chat_id: string; text: string };
    expect(body.chat_id).toBe("-100999");
    expect(body.text).toContain("BAISSE FLASH");
    expect(body.text).toContain("899");
  });

  it("retente sur erreur HTTP puis réussit", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce({ ok: false, status: 502, text: () => Promise.resolve("bad gateway") })
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve("") });
    const res = await new TelegramChannel({
      botToken: "T",
      chatId: "1",
      fetchImpl,
      maxAttempts: 3,
    }).send(notif);
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("échec final => ok:false avec message (jamais d'exception)", async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve("chat not found") });
    const res = await new TelegramChannel({
      botToken: "T",
      chatId: "1",
      fetchImpl,
      maxAttempts: 2,
    }).send(notif);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("400");
    expect(res.error).toContain("chat not found");
  });

  it("tronque un corps très long sous la limite Telegram", async () => {
    const fetchImpl = vi.fn(ok);
    await new TelegramChannel({ botToken: "T", chatId: "1", fetchImpl, maxAttempts: 1 }).send({
      ...notif,
      body: "x".repeat(9000),
    });
    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body) as { text: string };
    expect(body.text.length).toBeLessThanOrEqual(4096);
  });
});
