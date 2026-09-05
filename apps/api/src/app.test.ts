import { loadConfig } from "@fbr/config";
import { createSilentLogger } from "@fbr/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type ApiInstance } from "./app.js";

const config = loadConfig({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://fbr:fbr@localhost:5432/fbr",
  REDIS_URL: "redis://localhost:6379",
});

describe("api /health", () => {
  let app: ApiInstance;

  beforeAll(async () => {
    app = buildApp({ config, logger: createSilentLogger() });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("répond 200 avec un rapport structuré (db 'skipped' sans handle)", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json<Record<string, unknown>>();
    expect(body).toMatchObject({
      status: "ok",
      service: "api",
      checks: { database: "skipped" },
    });
    expect(typeof body.uptimeSeconds).toBe("number");
  });

  it("renvoie 404 sur une route inconnue", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
  });
});
