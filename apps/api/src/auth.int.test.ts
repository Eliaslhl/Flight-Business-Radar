import { loadConfig } from "@fbr/config";
import { createSilentLogger } from "@fbr/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type ApiInstance } from "./app.js";
import { closeTestDb, getTestDb, hasDb, truncateAll } from "./it-support.js";
import type { DbHandle } from "@fbr/database";

const suite = hasDb ? describe : describe.skip;

const config = loadConfig({
  NODE_ENV: "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://fbr:fbr@localhost:5432/fbr",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  SESSION_SECRET: "test-session-secret-please",
});

const cookieFrom = (res: { headers: Record<string, unknown> }): string => {
  const raw = res.headers["set-cookie"];
  const line: unknown = Array.isArray(raw) ? raw[0] : raw;
  return typeof line === "string" ? (line.split(";")[0] ?? "") : "";
};

const search = {
  origin: "CDG",
  destinations: ["HND"],
  departureWindow: { start: "2026-11-01", end: "2026-11-30" },
  tripDuration: { minDays: 10, maxDays: 14 },
};

suite("API auth e-mail / mot de passe (intégration)", () => {
  let handle: DbHandle;
  let app: ApiInstance;

  beforeAll(async () => {
    handle = await getTestDb();
    app = buildApp({ config, logger: createSilentLogger(), db: handle });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await handle.sql`DELETE FROM users WHERE email LIKE 'authtest-%'`;
    await closeTestDb();
  });
  beforeEach(async () => {
    await truncateAll(handle);
    await handle.sql`DELETE FROM users WHERE email LIKE 'authtest-%'`;
  });

  const register = (email: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "hunter2hunter2" },
    });

  it("refuse l'accès sans session, l'accorde après register/login", async () => {
    expect((await app.inject({ method: "GET", url: "/api/searches" })).statusCode).toBe(401);

    const reg = await register("authtest-a@example.com");
    expect(reg.statusCode).toBe(201);
    const cookie = cookieFrom(reg);
    expect(cookie).toContain("fbr_session=");

    const listed = await app.inject({
      method: "GET",
      url: "/api/searches",
      headers: { cookie },
    });
    expect(listed.statusCode).toBe(200);

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    expect(me.json<{ user: { email: string } }>().user.email).toBe("authtest-a@example.com");
  });

  it("e-mail déjà pris ⇒ 409 ; mauvais mot de passe ⇒ 401", async () => {
    await register("authtest-b@example.com");
    expect((await register("authtest-b@example.com")).statusCode).toBe(409);

    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "authtest-b@example.com", password: "wrongwrong" },
    });
    expect(bad.statusCode).toBe(401);
  });

  it("cloisonne les recherches par utilisateur", async () => {
    const a = cookieFrom(await register("authtest-c@example.com"));
    const b = cookieFrom(await register("authtest-d@example.com"));

    const created = await app.inject({
      method: "POST",
      url: "/api/searches",
      headers: { cookie: a },
      payload: search,
    });
    const id = created.json<{ id: string }>().id;

    // B ne voit pas la recherche de A
    expect(
      (await app.inject({ method: "GET", url: "/api/searches", headers: { cookie: b } })).json<{
        searches: unknown[];
      }>().searches,
    ).toHaveLength(0);
    // ni ne peut y accéder
    expect(
      (await app.inject({ method: "GET", url: `/api/searches/${id}`, headers: { cookie: b } }))
        .statusCode,
    ).toBe(404);
    // A la voit
    expect(
      (await app.inject({ method: "GET", url: `/api/searches/${id}`, headers: { cookie: a } }))
        .statusCode,
    ).toBe(200);
  });
});
