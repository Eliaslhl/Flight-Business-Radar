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

  it("GET /api/notifications/channels liste les canaux sans exposer de secret", async () => {
    const res = await app.inject({ method: "GET", url: "/api/notifications/channels" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ channels: { name: string; configured: boolean }[] }>();
    expect(body.channels.map((c) => c.name)).toEqual(["CONSOLE", "TELEGRAM", "EMAIL", "WEBHOOK"]);
    expect(body.channels.find((c) => c.name === "CONSOLE")?.configured).toBe(true);
    expect(body.channels.find((c) => c.name === "TELEGRAM")?.configured).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/token|smtp|password|secret/i);
  });

  it("GET /api/radar/destinations expose la liste seed CDG long-courrier", async () => {
    const res = await app.inject({ method: "GET", url: "/api/radar/destinations" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      origin: string;
      count: number;
      destinations: { iata: string; city: string; region: string }[];
    }>();
    expect(body.origin).toBe("CDG");
    expect(body.count).toBe(body.destinations.length);
    expect(body.count).toBeGreaterThanOrEqual(40);
    expect(body.destinations.every((d) => /^[A-Z]{3}$/.test(d.iata))).toBe(true);
  });

  it("GET /api/airports expose le référentiel d'autocomplétion", async () => {
    const res = await app.inject({ method: "GET", url: "/api/airports" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ count: number; airports: { iata: string; city: string }[] }>();
    expect(body.count).toBe(body.airports.length);
    expect(body.count).toBeGreaterThan(100);
    expect(body.airports.some((a) => a.iata === "CDG" && a.city.includes("Paris"))).toBe(true);
  });
});
