import { and, desc, eq } from "drizzle-orm";
import { type Database } from "../client.js";
import { providerRequests, type ProviderRequestRow } from "../schema/core.table.js";

export interface ProviderRequestInput {
  provider: string;
  searchId: string | null;
  ok: boolean;
  offerCount: number;
  latencyMs: number;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export const insertProviderRequests = async (
  db: Database,
  rows: readonly ProviderRequestInput[],
): Promise<number> => {
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(providerRequests)
    .values(
      rows.map((r) => ({
        provider: r.provider,
        searchId: r.searchId,
        ok: r.ok,
        offerCount: r.offerCount,
        latencyMs: r.latencyMs,
        errorCode: r.errorCode ?? null,
        errorMessage: r.errorMessage ?? null,
      })),
    )
    .returning({ id: providerRequests.id });
  return inserted.length;
};

export const listProviderRequests = async (
  db: Database,
  options: { searchId?: string; provider?: string; limit?: number } = {},
): Promise<ProviderRequestRow[]> => {
  const clauses = [
    options.searchId ? eq(providerRequests.searchId, options.searchId) : undefined,
    options.provider ? eq(providerRequests.provider, options.provider) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  return db
    .select()
    .from(providerRequests)
    .where(clauses.length > 0 ? and(...clauses) : undefined)
    .orderBy(desc(providerRequests.createdAt))
    .limit(options.limit ?? 200);
};
