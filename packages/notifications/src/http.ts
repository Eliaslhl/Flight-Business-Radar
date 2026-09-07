export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface PostJsonOptions {
  readonly url: string;
  readonly body: unknown;
  readonly timeoutMs: number;
  readonly fetchImpl: FetchLike;
  readonly headers?: Record<string, string>;
}

/**
 * POST JSON avec timeout dur (`AbortController`). Lève une erreur explicite sur
 * timeout, panne réseau ou statut non-2xx (corps tronqué inclus dans le message)
 * — de quoi laisser `withRetry` retenter et `dispatch` historiser l'échec.
 */
export const postJson = async (options: PostJsonOptions): Promise<void> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const res = await options.fetchImpl(options.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`HTTP ${String(res.status)}${detail ? ` — ${detail}` : ""}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`timeout après ${String(options.timeoutMs)} ms`);
    }
    // `fetch` (undici) masque la vraie cause réseau dans `error.cause`.
    if (
      error instanceof Error &&
      error.message === "fetch failed" &&
      error.cause instanceof Error
    ) {
      throw new Error(`échec réseau — ${error.cause.message || error.cause.name}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};
