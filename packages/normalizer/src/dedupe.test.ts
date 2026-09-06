import { describe, expect, it } from "vitest";
import { dedupeOffers } from "./dedupe.js";
import { makeOffer } from "./fixtures.js";

describe("dedupeOffers", () => {
  it("conserve l'offre la moins chère par empreinte", () => {
    const cheap = makeOffer({ provider: "a", fingerprint: "fbr_x", price: { amount: 120_000 } });
    const pricey = makeOffer({ provider: "b", fingerprint: "fbr_x", price: { amount: 150_000 } });
    const other = makeOffer({ provider: "a", fingerprint: "fbr_y", price: { amount: 99_000 } });

    const { kept, duplicates } = dedupeOffers([pricey, cheap, other]);
    expect(kept).toHaveLength(2);
    expect(kept.find((o) => o.fingerprint === "fbr_x")?.provider).toBe("a");
    expect(duplicates).toEqual([pricey]);
  });

  it("à prix égal, respecte l'ordre de préférence des providers", () => {
    const a = makeOffer({ provider: "serpapi", fingerprint: "fbr_z", price: { amount: 130_000 } });
    const b = makeOffer({ provider: "duffel", fingerprint: "fbr_z", price: { amount: 130_000 } });

    const { kept } = dedupeOffers([a, b], { preferProviders: ["duffel", "serpapi"] });
    expect(kept[0]?.provider).toBe("duffel");
  });

  it("est déterministe sans préférence (tie-break par nom de provider)", () => {
    const a = makeOffer({ provider: "zeta", fingerprint: "fbr_z", price: { amount: 130_000 } });
    const b = makeOffer({ provider: "alpha", fingerprint: "fbr_z", price: { amount: 130_000 } });
    expect(dedupeOffers([a, b]).kept[0]?.provider).toBe("alpha");
    expect(dedupeOffers([b, a]).kept[0]?.provider).toBe("alpha");
  });

  it("ne touche pas à des offres toutes distinctes", () => {
    const offers = [
      makeOffer({ fingerprint: "fbr_1" }),
      makeOffer({ fingerprint: "fbr_2" }),
      makeOffer({ fingerprint: "fbr_3" }),
    ];
    const { kept, duplicates } = dedupeOffers(offers);
    expect(kept).toHaveLength(3);
    expect(duplicates).toHaveLength(0);
  });
});
