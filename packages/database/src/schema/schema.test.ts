import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { appMeta } from "./app-meta.table.js";
import * as schema from "./index.js";

describe("schema/app_meta", () => {
  it("expose la table app_meta avec les colonnes attendues", () => {
    const config = getTableConfig(appMeta);
    expect(config.name).toBe("app_meta");
    const columns = config.columns.map((c) => c.name).sort();
    expect(columns).toEqual(["key", "updated_at", "value"]);
    expect(config.columns.find((c) => c.name === "key")?.primary).toBe(true);
    expect(config.columns.find((c) => c.name === "value")?.notNull).toBe(true);
  });

  it("le barrel de schéma ré-exporte app_meta", () => {
    expect(schema.appMeta).toBe(appMeta);
  });
});
