import { describe, expect, it, vi } from "vitest";
import { createLogger, createSilentLogger } from "./logger.js";

describe("logger", () => {
  it("émet du JSON structuré avec service + event et redacte les secrets", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });

    const logger = createLogger({ name: "test-svc", level: "info", pretty: false });
    logger.info({ event: "provider_request", apiKey: "super-secret", url: "https://x" }, "hello");

    spy.mockRestore();

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(entry.service).toBe("test-svc");
    expect(entry.event).toBe("provider_request");
    expect(entry.msg).toBe("hello");
    expect(entry.apiKey).toBe("[redacted]");
    expect(entry.level).toBe("info");
  });

  it("createSilentLogger n'écrit rien", () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    createSilentLogger().error("boom");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
