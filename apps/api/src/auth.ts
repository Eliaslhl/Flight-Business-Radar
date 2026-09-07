import { createHmac, timingSafeEqual } from "node:crypto";
import { DEV_USER_ID } from "@fbr/database";
import type { FastifyReply, FastifyRequest } from "fastify";

const COOKIE = "fbr_session";

export interface AuthConfig {
  readonly sessionSecret: string;
  readonly sessionTtlDays: number;
}

const b64url = (buf: Buffer): string => buf.toString("base64url");

/** Jeton opaque `<userId>.<expEpochSec>.<hmac>` signé HMAC-SHA256. */
export const signSession = (userId: string, cfg: AuthConfig): string => {
  const exp = Math.floor(Date.now() / 1000) + cfg.sessionTtlDays * 86_400;
  const payload = `${userId}.${String(exp)}`;
  const sig = b64url(createHmac("sha256", cfg.sessionSecret).update(payload).digest());
  return `${payload}.${sig}`;
};

/** Retourne l'`userId` si le jeton est valide et non expiré, sinon `null`. */
export const verifySession = (token: string, cfg: AuthConfig): string | null => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts as [string, string, string];
  const expected = b64url(
    createHmac("sha256", cfg.sessionSecret).update(`${userId}.${expStr}`).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  return userId;
};

export const setSessionCookie = (reply: FastifyReply, userId: string, cfg: AuthConfig): void => {
  reply.setCookie(COOKIE, signSession(userId, cfg), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: cfg.sessionTtlDays * 86_400,
  });
};

export const clearSessionCookie = (reply: FastifyReply): void => {
  reply.clearCookie(COOKIE, { path: "/" });
};

/**
 * `preHandler` global : renseigne `request.userId`.
 * - auth désactivée (`cfg` null) ⇒ utilisateur de dev (comportement historique).
 * - auth activée ⇒ lit le cookie de session ; `userId` reste `undefined` si absent
 *   ou invalide (les gardes de routes renverront alors 401).
 */
export const resolveUser =
  (cfg: AuthConfig | null) =>
  (request: FastifyRequest): void => {
    if (!cfg) {
      request.userId = DEV_USER_ID;
      return;
    }
    const raw = request.cookies[COOKIE];
    const uid = raw ? verifySession(raw, cfg) : null;
    if (uid) request.userId = uid;
  };

/** Garde de route : renvoie l'`userId` ou lève une 401 déjà envoyée. */
export const requireUser = (request: FastifyRequest, reply: FastifyReply): string | null => {
  if (!request.userId) {
    void reply.code(401).send({ error: "UNAUTHENTICATED" });
    return null;
  }
  return request.userId;
};
