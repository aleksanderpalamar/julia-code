import type { EmbeddingProvider } from './provider.js';
import { EmbeddingProviderError } from './provider.js';

export interface OllamaProviderOptions {
  host: string;
  model: string;
  availabilityTimeoutMs?: number;
  embedTimeoutMs?: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'ollama';
  readonly model: string;
  private readonly host: string;
  private readonly availabilityTimeoutMs: number;
  private readonly embedTimeoutMs: number;

  constructor(opts: OllamaProviderOptions) {
    this.host = opts.host.replace(/\/$/, '');
    this.model = opts.model;
    this.availabilityTimeoutMs = opts.availabilityTimeoutMs ?? 1_500;
    this.embedTimeoutMs = opts.embedTimeoutMs ?? 10_000;
  }

  async available(): Promise<boolean> {
    const tags = await this.fetchWithTimeout(
      `${this.host}/api/tags`,
      { method: 'GET' },
      this.availabilityTimeoutMs,
    ).catch(() => null);
    if (!tags || !tags.ok) return false;
    const data = await tags.json().catch(() => null) as { models?: Array<{ name: string }> } | null;
    if (!data?.models) return false;
    return data.models.some(m => m.name === this.model || m.name.startsWith(`${this.model}:`));
  }

  async embed(text: string): Promise<Float32Array> {
    const res = await this.fetchWithTimeout(
      `${this.host}/api/embeddings`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      },
      this.embedTimeoutMs,
    ).catch((err: unknown) => {
      throw new EmbeddingProviderError(`ollama embed request failed: ${errMessage(err)}`, err);
    });

    if (!res.ok) {
      throw new EmbeddingProviderError(`ollama embed returned HTTP ${res.status}`);
    }
    const data = await res.json().catch((err: unknown) => {
      throw new EmbeddingProviderError(`ollama embed response was not valid JSON: ${errMessage(err)}`, err);
    }) as { embedding?: number[] };
    if (!data.embedding || !Array.isArray(data.embedding) || data.embedding.length === 0) {
      throw new EmbeddingProviderError('ollama embed response missing "embedding" array');
    }
    return Float32Array.from(data.embedding);
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
