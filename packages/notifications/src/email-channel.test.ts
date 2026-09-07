import { describe, expect, it, vi } from "vitest";
import { EmailChannel, type MailMessage, type MailTransport } from "./email-channel.js";
import { type OutboundNotification } from "./types.js";

const notif: OutboundNotification = {
  type: "TARGET_PRICE",
  subject: "🎯 Prix cible atteint",
  body: "CDG → NRT\n2026-10-05 → 2026-10-19\n\nPrix : 1 150 €\n🎯 Ta cible est atteinte.",
  payload: {},
  dedupeKey: "s1:TARGET_PRICE:NRT:2026-10-05:2026-09-07",
};

const transport = (impl: MailTransport["sendMail"]): MailTransport => ({ sendMail: impl });

describe("EmailChannel", () => {
  it("envoie un mail texte from/to/subject/body et renvoie ok", async () => {
    const sent: MailMessage[] = [];
    const res = await new EmailChannel({
      smtpUrl: "smtp://localhost:1025",
      from: "radar@localhost",
      to: "me@localhost",
      maxAttempts: 1,
      transport: transport((m) => {
        sent.push(m);
        return Promise.resolve({ messageId: "1" });
      }),
    }).send(notif);

    expect(res).toEqual({ channel: "EMAIL", ok: true });
    expect(sent[0]).toEqual({
      from: "radar@localhost",
      to: "me@localhost",
      subject: "🎯 Prix cible atteint",
      text: notif.body,
    });
  });

  it("retente un envoi qui échoue puis réussit", async () => {
    const sendMail = vi
      .fn<MailTransport["sendMail"]>()
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValue({ messageId: "2" });
    const res = await new EmailChannel({
      smtpUrl: "smtp://x",
      from: "a@b",
      to: "c@d",
      maxAttempts: 3,
      transport: { sendMail },
    }).send(notif);
    expect(res.ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it("échec SMTP persistant => ok:false avec le message d'erreur", async () => {
    const res = await new EmailChannel({
      smtpUrl: "smtp://x",
      from: "a@b",
      to: "c@d",
      maxAttempts: 2,
      transport: transport(() => Promise.reject(new Error("535 auth failed"))),
    }).send(notif);
    expect(res).toMatchObject({ channel: "EMAIL", ok: false });
    expect(res.error).toContain("535 auth failed");
  });
});
