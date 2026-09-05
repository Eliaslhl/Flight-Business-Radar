import { describe, expect, it } from "vitest";
import {
  AppError,
  ConfigError,
  DataQualityError,
  ProviderError,
  isAppError,
  toAppError,
} from "./errors.js";

describe("errors", () => {
  it("AppError porte code, retryable et contexte", () => {
    const e = new AppError("nope", { code: "INTERNAL", context: { a: 1 } });
    expect(e.code).toBe("INTERNAL");
    expect(e.retryable).toBe(false);
    expect(e.name).toBe("AppError");
    expect(e.toLogObject()).toMatchObject({ name: "AppError", code: "INTERNAL", a: 1 });
  });

  it("ConfigError / DataQualityError ne sont pas retryables", () => {
    expect(new ConfigError("x").retryable).toBe(false);
    expect(new DataQualityError("x").retryable).toBe(false);
    expect(new ConfigError("x").code).toBe("CONFIG_INVALID");
  });

  it("ProviderError est retryable par défaut et accepte un code spécifique", () => {
    expect(new ProviderError("x").retryable).toBe(true);
    const timeout = new ProviderError("slow", { code: "PROVIDER_TIMEOUT", retryable: true });
    expect(timeout.code).toBe("PROVIDER_TIMEOUT");
  });

  it("toAppError normalise n'importe quelle valeur catch", () => {
    expect(isAppError(toAppError(new Error("raw")))).toBe(true);
    expect(toAppError("string").code).toBe("INTERNAL");
    expect(toAppError({ weird: true }).context).toEqual({ value: { weird: true } });
    const original = new ConfigError("keep me");
    expect(toAppError(original)).toBe(original);
  });
});
