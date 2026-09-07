import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry.js";

const noSleep = (): Promise<void> => Promise.resolve();

describe("withRetry", () => {
  it("réussit du premier coup sans attendre", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retente jusqu'au succès et notifie chaque nouvelle tentative", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockResolvedValue("ok");
    const onRetry = vi.fn();
    await expect(withRetry(fn, { sleep: noSleep, onRetry })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({ attempt: 1 });
  });

  it("relance la dernière erreur après avoir épuisé les tentatives", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("toujours"));
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toThrow("toujours");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("applique un backoff linéaire (baseDelay × tentative)", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(1);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await withRetry(fn, { baseDelayMs: 50, sleep });
    expect(sleep).toHaveBeenCalledWith(50);
  });
});
