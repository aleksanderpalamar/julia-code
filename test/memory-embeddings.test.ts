import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let mockConfig = {
  ollamaHost: "http://ollama.test",
  memorySemantic: {
    enabled: false,
    provider: "ollama" as "ollama" | "null",
    embeddingModel: "nomic-embed-text",
    rankingWeights: { similarity: 0.6, importance: 0.3, recency: 0.1 },
    recencyHalflifeDays: 30,
    maxMemories: 5,
    availabilityCheckTtlMs: 50,
    autoBackfillOnStart: false,
  },
};

vi.mock("../src/config/index.js", () => ({
  getConfig: () => mockConfig,
}));

import {
  getEmbeddingProvider,
  isEmbeddingProviderAvailable,
  resetEmbeddingProviderCache,
  EmbeddingProviderError,
} from "../src/memory/embeddings/index.js";
import { OllamaEmbeddingProvider } from "../src/memory/embeddings/ollama-provider.js";
import { NullEmbeddingProvider } from "../src/memory/embeddings/null-provider.js";

type FetchMock = ReturnType<typeof vi.fn>;

function installFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): FetchMock {
  const mock = vi.fn(async (url: string | URL, init?: RequestInit) => handler(String(url), init));
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetEmbeddingProviderCache();
  mockConfig = {
    ollamaHost: "http://ollama.test",
    memorySemantic: {
      enabled: false,
      provider: "ollama",
      embeddingModel: "nomic-embed-text",
      rankingWeights: { similarity: 0.6, importance: 0.3, recency: 0.1 },
      recencyHalflifeDays: 30,
      maxMemories: 5,
      availabilityCheckTtlMs: 50,
      autoBackfillOnStart: false,
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getEmbeddingProvider", () => {
  it("returns an OllamaEmbeddingProvider when config.provider === 'ollama'", () => {
    const p = getEmbeddingProvider();
    expect(p).toBeInstanceOf(OllamaEmbeddingProvider);
    expect(p.name).toBe("ollama");
    expect(p.model).toBe("nomic-embed-text");
  });

  it("returns a NullEmbeddingProvider when config.provider === 'null'", () => {
    mockConfig.memorySemantic.provider = "null";
    const p = getEmbeddingProvider();
    expect(p).toBeInstanceOf(NullEmbeddingProvider);
    expect(p.name).toBe("null");
  });

  it("caches the provider instance across calls with identical config", () => {
    const a = getEmbeddingProvider();
    const b = getEmbeddingProvider();
    expect(a).toBe(b);
  });

  it("rebuilds the provider when host or model changes", () => {
    const a = getEmbeddingProvider();
    mockConfig.memorySemantic.embeddingModel = "other-model";
    const b = getEmbeddingProvider();
    expect(a).not.toBe(b);
    expect(b.model).toBe("other-model");
  });
});

describe("OllamaEmbeddingProvider.available()", () => {
  it("returns true when /api/tags lists the configured model", async () => {
    installFetch(() => jsonResponse({ models: [{ name: "nomic-embed-text" }, { name: "qwen3:8b" }] }));
    const p = getEmbeddingProvider();
    await expect(p.available()).resolves.toBe(true);
  });

  it("returns true when model name matches the prefix (tag variant)", async () => {
    installFetch(() => jsonResponse({ models: [{ name: "nomic-embed-text:latest" }] }));
    const p = getEmbeddingProvider();
    await expect(p.available()).resolves.toBe(true);
  });

  it("returns false when the model is not listed", async () => {
    installFetch(() => jsonResponse({ models: [{ name: "qwen3:8b" }] }));
    const p = getEmbeddingProvider();
    await expect(p.available()).resolves.toBe(false);
  });

  it("returns false when the host is unreachable", async () => {
    installFetch(() => { throw new TypeError("fetch failed"); });
    const p = getEmbeddingProvider();
    await expect(p.available()).resolves.toBe(false);
  });

  it("returns false on non-OK response", async () => {
    installFetch(() => new Response("", { status: 500 }));
    const p = getEmbeddingProvider();
    await expect(p.available()).resolves.toBe(false);
  });
});

describe("OllamaEmbeddingProvider.embed()", () => {
  it("returns a Float32Array from the API response", async () => {
    installFetch((url) => {
      expect(url).toBe("http://ollama.test/api/embeddings");
      return jsonResponse({ embedding: [0.1, 0.2, 0.3] });
    });
    const p = getEmbeddingProvider();
    const vec = await p.embed("hello");
    expect(vec).toBeInstanceOf(Float32Array);
    expect(Array.from(vec)).toEqual([
      Float32Array.from([0.1])[0],
      Float32Array.from([0.2])[0],
      Float32Array.from([0.3])[0],
    ]);
  });

  it("throws EmbeddingProviderError when response has no embedding array", async () => {
    installFetch(() => jsonResponse({ wrong: [] }));
    const p = getEmbeddingProvider();
    await expect(p.embed("hello")).rejects.toBeInstanceOf(EmbeddingProviderError);
  });

  it("throws EmbeddingProviderError on non-OK HTTP status", async () => {
    installFetch(() => new Response("oops", { status: 500 }));
    const p = getEmbeddingProvider();
    await expect(p.embed("hello")).rejects.toBeInstanceOf(EmbeddingProviderError);
  });

  it("throws EmbeddingProviderError when fetch rejects", async () => {
    installFetch(() => { throw new TypeError("network down"); });
    const p = getEmbeddingProvider();
    await expect(p.embed("hello")).rejects.toBeInstanceOf(EmbeddingProviderError);
  });
});

describe("NullEmbeddingProvider", () => {
  it("always reports unavailable and throws on embed", async () => {
    mockConfig.memorySemantic.provider = "null";
    const p = getEmbeddingProvider();
    await expect(p.available()).resolves.toBe(false);
    await expect(p.embed("x")).rejects.toBeInstanceOf(EmbeddingProviderError);
  });
});

describe("isEmbeddingProviderAvailable() with TTL caching", () => {
  it("caches the availability result for availabilityCheckTtlMs", async () => {
    const fetchMock = installFetch(() => jsonResponse({ models: [{ name: "nomic-embed-text" }] }));
    await expect(isEmbeddingProviderAvailable()).resolves.toBe(true);
    await expect(isEmbeddingProviderAvailable()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after TTL expires", async () => {
    let firstCall = true;
    const fetchMock = installFetch(() => {
      if (firstCall) {
        firstCall = false;
        return jsonResponse({ models: [{ name: "nomic-embed-text" }] });
      }
      return jsonResponse({ models: [] });
    });
    await expect(isEmbeddingProviderAvailable()).resolves.toBe(true);
    await new Promise(r => setTimeout(r, mockConfig.memorySemantic.availabilityCheckTtlMs + 10));
    await expect(isEmbeddingProviderAvailable()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
