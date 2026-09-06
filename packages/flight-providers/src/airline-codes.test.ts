import { describe, expect, it } from "vitest";
import { resolveAirlineCode } from "./airline-codes.js";

describe("resolveAirlineCode", () => {
  it("garde un code IATA déjà valide", () => {
    expect(resolveAirlineCode("AF")).toBe("AF");
    expect(resolveAirlineCode("nh")).toBe("NH");
  });

  it("mappe les noms connus (insensible à la casse)", () => {
    expect(resolveAirlineCode("Air France")).toBe("AF");
    expect(resolveAirlineCode("LUFTHANSA")).toBe("LH");
    expect(resolveAirlineCode("Qatar Airways")).toBe("QR");
    expect(resolveAirlineCode("All Nippon Airways")).toBe("NH");
  });

  it("repli sur 2 caractères puis XX", () => {
    expect(resolveAirlineCode("Some Unknown Air")).toBe("SO");
    expect(resolveAirlineCode("")).toBe("XX");
    expect(resolveAirlineCode(null)).toBe("XX");
    expect(resolveAirlineCode("é")).toBe("XX");
  });
});
