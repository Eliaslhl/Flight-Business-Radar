import { describe, expect, it } from "vitest";
import { err, isErr, isOk, mapResult, ok, partitionResults, unwrapOr } from "./result.js";

describe("Result", () => {
  it("construit et discrimine Ok / Err", () => {
    const good = ok(42);
    const bad = err("boom");
    expect(isOk(good)).toBe(true);
    expect(isErr(bad)).toBe(true);
    if (isOk(good)) expect(good.value).toBe(42);
    if (isErr(bad)) expect(bad.error).toBe("boom");
  });

  it("mapResult transforme uniquement les Ok", () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual(ok(6));
    expect(mapResult(err<string>("e"), (n: number) => n * 3)).toEqual(err("e"));
  });

  it("unwrapOr renvoie le fallback pour un Err", () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err("e") as never, 9)).toBe(9);
  });

  it("partitionResults sépare valeurs et erreurs en préservant l'ordre", () => {
    const { values, errors } = partitionResults([ok(1), err("a"), ok(2), err("b"), ok(3)]);
    expect(values).toEqual([1, 2, 3]);
    expect(errors).toEqual(["a", "b"]);
  });
});
