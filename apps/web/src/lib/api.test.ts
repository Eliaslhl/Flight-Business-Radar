import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

const mockFetch = (
  body: unknown,
  init: { status?: number; ok?: boolean } = {},
): ReturnType<typeof vi.fn> => {
  const status = init.status ?? 200;
  const fn = vi.fn().mockResolvedValue({
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("GET listSearches déballe { searches }", async () => {
    const fn = mockFetch({ searches: [{ id: "s1" }] });
    const rows = await api.listSearches();
    expect(rows).toEqual([{ id: "s1" }]);
    expect(fn).toHaveBeenCalledWith(
      "/api/searches",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("POST createSearch envoie un corps JSON", async () => {
    const fn = mockFetch({ id: "s2" });
    await api.createSearch({
      origin: "CDG",
      destinations: ["HND"],
      departureWindow: { start: "2026-11-01", end: "2026-11-30" },
      tripDuration: { minDays: 10, maxDays: 14 },
    });
    const [, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ origin: "CDG" });
  });

  it("204 → undefined (deleteSearch)", async () => {
    mockFetch(null, { status: 204 });
    await expect(api.deleteSearch("s1")).resolves.toBeUndefined();
  });

  it("réponse non-2xx → ApiError avec le détail", async () => {
    mockFetch({ error: "VALIDATION_FAILED", issues: [] }, { status: 400 });
    await expect(api.createSearch({} as never)).rejects.toBeInstanceOf(ApiError);
    try {
      mockFetch({ error: "NOT_FOUND" }, { status: 404 });
      await api.getSearch("x");
    } catch (e) {
      expect((e as ApiError).status).toBe(404);
      expect((e as ApiError).detail).toEqual({ error: "NOT_FOUND" });
    }
  });

  it("listAlerts passe le filtre searchId", async () => {
    const fn = mockFetch({ alerts: [] });
    await api.listAlerts("s1");
    expect(fn).toHaveBeenCalledWith("/api/alerts?searchId=s1", expect.any(Object));
  });
});
