import { createSilentLogger } from "@fbr/shared";
import { describe, expect, it, vi } from "vitest";
import { createWorkerRuntime } from "./runtime.js";

describe("worker runtime", () => {
  it("démarre, bat le cœur, puis s'arrête proprement", async () => {
    vi.useFakeTimers();
    const runtime = createWorkerRuntime({ logger: createSilentLogger(), heartbeatMs: 10 });

    expect(runtime.isRunning).toBe(false);
    runtime.start();
    expect(runtime.isRunning).toBe(true);

    vi.advanceTimersByTime(35);
    await runtime.stop();
    expect(runtime.isRunning).toBe(false);

    vi.useRealTimers();
  });

  it("start() est idempotent et stop() sans start() ne casse pas", async () => {
    const runtime = createWorkerRuntime({ logger: createSilentLogger(), heartbeatMs: 1000 });
    await runtime.stop();
    runtime.start();
    runtime.start();
    expect(runtime.isRunning).toBe(true);
    await runtime.stop();
  });
});
