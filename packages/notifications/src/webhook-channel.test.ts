import { describe, expect, it, vi } from "vitest";
import { WebhookChannel } from "./webhook-channel.js";
import { type FetchLike } from "./http.js";
import { type OutboundNotification } from "./types.js";

const notif: OutboundNotification = {
  type: "PRICE_DROP",
  subject: "📉 Baisse de prix",
  body: "CDG → JFK\n1 200 € → 980 €",
  payload: { dropPct: -0.18 },
  dedupeKey: "s1:PRICE_DROP:JFK:2026-12-01:2026-09-07",
};

describe("WebhookChannel", () => {
  it("POST un JSON compatible Discord/Slack/custom", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(""),
    });
    const res = await new WebhookChannel({
      url: "https://hooks.example.com/abc",
      fetchImpl,
      maxAttempts: 1,
    }).send(notif);

    expect(res).toEqual({ channel: "WEBHOOK", ok: true });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://hooks.example.com/abc");
    const body = JSON.parse(init.body) as {
      content: string;
      text: string;
      dedupeKey: string;
      payload: unknown;
    };
    expect(body.content).toContain("Baisse de prix"); // Discord
    expect(body.text).toContain("980"); // Slack / ntfy
    expect(body.dedupeKey).toBe(notif.dedupeKey);
    expect(body.payload).toEqual({ dropPct: -0.18 });
  });

  it("échec réseau => ok:false après retries", async () => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await new WebhookChannel({
      url: "https://down.example.com",
      fetchImpl,
      maxAttempts: 2,
    }).send(notif);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("ECONNREFUSED");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
