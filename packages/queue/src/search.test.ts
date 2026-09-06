import { describe, expect, it } from "vitest";
import { QUEUE_NAMES } from "./queues.js";
import { SEARCH_JOB_NAME, type SearchRunJobData } from "./search.js";

describe("queue constants", () => {
  it("expose des noms de file stables, préfixés et sans ':'", () => {
    expect(QUEUE_NAMES.search).toBe("fbr-search");
    expect(Object.values(QUEUE_NAMES).every((n) => n.startsWith("fbr-") && !n.includes(":"))).toBe(
      true,
    );
  });

  it("le nom de job de recherche est stable", () => {
    expect(SEARCH_JOB_NAME).toBe("search.run");
  });

  it("le type de payload est bien formé", () => {
    const data: SearchRunJobData = { searchId: "s1", reason: "manual" };
    expect(data.reason).toBe("manual");
  });
});
