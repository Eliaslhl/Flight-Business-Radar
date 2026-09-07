import { eq, sql } from "drizzle-orm";
import { type Database } from "../client.js";
import { users, type UserRow } from "../schema/core.table.js";

export type { UserRow } from "../schema/core.table.js";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName?: string | null;
}

/** Recherche par e-mail (insensible à la casse). */
export const findUserByEmail = async (
  db: Database,
  email: string,
): Promise<UserRow | undefined> => {
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  return row;
};

export const findUserById = async (db: Database, id: string): Promise<UserRow | undefined> => {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
};

/** Crée un compte. Lève si l'e-mail existe déjà (contrainte unique). */
export const createUser = async (db: Database, input: CreateUserInput): Promise<UserRow> => {
  const [row] = await db
    .insert(users)
    .values({
      email: input.email.trim(),
      passwordHash: input.passwordHash,
      displayName: input.displayName ?? null,
    })
    .returning();
  if (!row) throw new Error("createUser: aucune ligne retournée");
  return row;
};

/** Nombre total de comptes — sert à détecter le tout premier inscrit. */
export const countUsers = async (db: Database): Promise<number> => {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return row?.n ?? 0;
};

/**
 * Rattache toutes les recherches / alertes / notifications encore orphelines
 * (utilisateur de dev) au compte `userId`. Appelé une seule fois, à la création
 * du tout premier compte réel d'un déploiement.
 */
export const adoptOrphanData = async (db: Database, userId: string): Promise<void> => {
  await db.execute(sql`
    UPDATE searches SET user_id = ${userId}
    WHERE user_id = '00000000-0000-0000-0000-000000000001'
  `);
  await db.execute(sql`
    UPDATE alerts SET user_id = ${userId}
    WHERE user_id = '00000000-0000-0000-0000-000000000001'
  `);
  await db.execute(sql`
    UPDATE notifications SET user_id = ${userId}
    WHERE user_id = '00000000-0000-0000-0000-000000000001'
  `);
};
