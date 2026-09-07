import { type LlmClient, type LlmPrompt } from "./types.js";

type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

export interface AnthropicClientOptions {
  readonly apiKey: string;
  /** ex. `claude-sonnet-5`. */
  readonly model: string;
  readonly maxTokens?: number;
  readonly timeoutMs?: number;
  readonly fetchImpl?: FetchLike;
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
}

/**
 * Client Claude via l'API Messages (fetch brut, aucune dépendance SDK). Actif
 * uniquement si `ANTHROPIC_API_KEY` est renseigné — sinon l'advisor utilise
 * `MockLlmClient`. La sortie est toujours repassée au contrôle de non-invention.
 */
export class AnthropicLlmClient implements LlmClient {
  readonly name: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: AnthropicClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.name = options.model;
    this.maxTokens = options.maxTokens ?? 600;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  }

  async complete(prompt: LlmPrompt): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        throw new Error(`Anthropic HTTP ${String(res.status)}${detail ? ` — ${detail}` : ""}`);
      }
      const data = (await res.json()) as AnthropicResponse;
      const text = (data.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!text) throw new Error("Anthropic : réponse vide");
      return text;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Anthropic : timeout après ${String(this.timeoutMs)} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
