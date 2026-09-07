import bcrypt from "bcryptjs";
import {
  adoptOrphanData,
  countUsers,
  createUser,
  findUserByEmail,
  findUserById,
  type Database,
} from "@fbr/database";
import { z } from "zod";
import { type Logger } from "@fbr/shared";
import type { FastifyReply } from "fastify";
import { clearSessionCookie, setSessionCookie, type AuthConfig } from "../auth.js";
import { type ApiInstance } from "../types.js";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});

export interface AuthRoutesDeps {
  readonly db: Database;
  readonly auth: AuthConfig | null;
  readonly logger: Logger;
}

const userDto = (row: { id: string; email: string; displayName: string | null }) => ({
  id: row.id,
  email: row.email,
  displayName: row.displayName,
});

export const registerAuthRoutes = (app: ApiInstance, deps: AuthRoutesDeps): void => {
  const { db, auth } = deps;
  const disabled = (reply: FastifyReply): undefined => {
    void reply.code(501).send({ error: "AUTH_DISABLED" });
    return undefined;
  };

  app.post("/api/auth/register", async (request, reply) => {
    if (!auth) return disabled(reply);
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "VALIDATION_FAILED",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { email, password } = parsed.data;
    if (await findUserByEmail(db, email)) {
      return reply.code(409).send({ error: "EMAIL_TAKEN" });
    }
    const first = (await countUsers(db)) <= 1; // seul le Dev User existe
    const user = await createUser(db, { email, passwordHash: await bcrypt.hash(password, 12) });
    if (first) {
      await adoptOrphanData(db, user.id);
      deps.logger.info({ event: "auth_first_user_adopted_orphans", userId: user.id }, "1er compte");
    }
    setSessionCookie(reply, user.id, auth);
    return reply.code(201).send({ user: userDto(user) });
  });

  app.post("/api/auth/login", async (request, reply) => {
    if (!auth) return disabled(reply);
    const parsed = credentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "VALIDATION_FAILED" });
    const user = await findUserByEmail(db, parsed.data.email);
    const ok =
      user?.passwordHash != null && (await bcrypt.compare(parsed.data.password, user.passwordHash));
    if (!ok || !user) return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    setSessionCookie(reply, user.id, auth);
    return reply.send({ user: userDto(user) });
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!auth) return reply.send({ user: null, authRequired: false });
    if (!request.userId) return reply.code(401).send({ error: "UNAUTHENTICATED" });
    const user = await findUserById(db, request.userId);
    if (!user) {
      clearSessionCookie(reply);
      return reply.code(401).send({ error: "UNAUTHENTICATED" });
    }
    return reply.send({ user: userDto(user), authRequired: true });
  });
};
