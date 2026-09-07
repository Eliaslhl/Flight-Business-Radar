import { loadConfig } from "@fbr/config";
import { createSilentLogger } from "@fbr/shared";
import { describe, expect, it } from "vitest";
import { buildNotificationService } from "./notifications.js";

const baseEnv = {
  DATABASE_URL: "postgresql://fbr:fbr@localhost:5432/fbr",
  REDIS_URL: "redis://localhost:6379",
} satisfies NodeJS.ProcessEnv;

const build = (env: NodeJS.ProcessEnv): string[] =>
  buildNotificationService(loadConfig({ ...baseEnv, ...env }), createSilentLogger()).channelNames;

describe("buildNotificationService", () => {
  it("n'active que le canal console par défaut", () => {
    expect(build({})).toEqual(["CONSOLE"]);
  });

  it("ajoute Telegram quand token + chat id sont présents", () => {
    expect(build({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" })).toEqual([
      "CONSOLE",
      "TELEGRAM",
    ]);
  });

  it("n'active pas Telegram si le chat id manque", () => {
    expect(build({ TELEGRAM_BOT_TOKEN: "t" })).toEqual(["CONSOLE"]);
  });

  it("active tous les canaux dont la config est complète", () => {
    expect(
      build({
        TELEGRAM_BOT_TOKEN: "t",
        TELEGRAM_CHAT_ID: "1",
        SMTP_URL: "smtp://localhost:1025",
        EMAIL_FROM: "a@b",
        EMAIL_TO: "c@d",
        NOTIFICATION_WEBHOOK_URL: "https://hooks.example.com/x",
      }),
    ).toEqual(["CONSOLE", "TELEGRAM", "EMAIL", "WEBHOOK"]);
  });
});
