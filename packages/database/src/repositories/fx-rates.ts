import { and, eq, sql } from "drizzle-orm";
import { type Database } from "../client.js";
import { fxRates } from "../schema/core.table.js";

export interface FxRateInput {
  base: string;
  quote: string;
  rate: number;
  asOf: string; // YYYY-MM-DD
  source: string;
}

export const getFxRate = async (
  db: Database,
  base: string,
  quote: string,
  asOf: string,
): Promise<number | undefined> => {
  const [row] = await db
    .select({ rate: fxRates.rate })
    .from(fxRates)
    .where(and(eq(fxRates.base, base), eq(fxRates.quote, quote), eq(fxRates.asOf, asOf)))
    .limit(1);
  return row ? Number(row.rate) : undefined;
};

export const upsertFxRate = async (db: Database, input: FxRateInput): Promise<void> => {
  const rate = input.rate.toString();
  await db
    .insert(fxRates)
    .values({
      base: input.base,
      quote: input.quote,
      rate,
      asOf: input.asOf,
      source: input.source,
    })
    .onConflictDoUpdate({
      target: [fxRates.base, fxRates.quote, fxRates.asOf],
      set: { rate, source: input.source, fetchedAt: sql`now()` },
    });
};
