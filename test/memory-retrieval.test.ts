import { describe, it, expect, vi } from "vitest";
import { retrieveRelevantMemories } from "../src/memory/retrieval.js";
import { buildContextBlock } from "../src/memory/context-builder.js";
import { float32ToBuffer } from "../src/memory/similarity.js";
import type { EmbeddingProvider } from "../src/memory/embeddings/index.js";
import type { Memory } from "../src/session/manager.js";
import type { RankedMemory } from "../src/memory/types.js";

function makeMemory(partial: Partial<Memory> & { key: string; vector: number[] }): Memory {
  const vec = Float32Array.from(partial.vector);
  return {
    id: Math.floor(Math.random() * 1e9),
    key: partial.key,
    content: partial.content ?? `content of ${partial.key}`,
    category: partial.category ?? "user",
    source_session_id: null,
    created_at: partial.created_at ?? new Date().toISOString(),
    updated_at: partial.updated_at ?? new Date().toISOString(),
    embedding: float32ToBuffer(vec),
    embedding_model: "nomic-embed-text",
    importance: partial.importance ?? null,
    last_accessed_at: null,
  };
}

function makeProvider(overrides: Partial<EmbeddingProvider> = {}): EmbeddingProvider {
  return {
    name: "mock",
    model: "mock-embed",
    available: async () => true,
    embed: async () => Float32Array.from([1, 0, 0]),
    ...overrides,
  };
}

const defaultDeps = {
  weights: { similarity: 0.6, importance: 0.3, recency: 0.1 },
  halflifeDays: 30,
  limit: 5,
  now: Date.parse("2026-04-24T12:00:00Z"),
};

describe("retrieveRelevantMemories", () => {
  it("returns [] when the provider is unavailable", async () => {
    const provider = makeProvider({ available: async () => false });
    const result = await retrieveRelevantMemories("query", {
      ...defaultDeps,
      provider,
      loadCandidates: () => [makeMemory({ key: "a", vector: [1, 0, 0] })],
    });
    expect(result).toEqual([]);
  });

  it("returns [] when embed throws, without propagating the error", async () => {
    const provider = makeProvider({
      embed: async () => { throw new Error("boom"); },
    });
    const result = await retrieveRelevantMemories("query", {
      ...defaultDeps,
      provider,
      loadCandidates: () => [makeMemory({ key: "a", vector: [1, 0, 0] })],
    });
    expect(result).toEqual([]);
  });

  it("returns [] when there are no candidates with embedding", async () => {
    const provider = makeProvider();
    const result = await retrieveRelevantMemories("query", {
      ...defaultDeps,
      provider,
      loadCandidates: () => [],
    });
    expect(result).toEqual([]);
  });

  it("ranks by cosine similarity + importance + recency and honors limit", async () => {
    const now = defaultDeps.now;
    const provider = makeProvider({ embed: async () => Float32Array.from([1, 0, 0]) });

    const candidates = [
      makeMemory({
        key: "mem-close",
        vector: [1, 0, 0],
        importance: 0.5,
        created_at: new Date(now).toISOString(),
      }),
      makeMemory({
        key: "mem-far",
        vector: [0, 1, 0],
        importance: 0.5,
        created_at: new Date(now).toISOString(),
      }),
      makeMemory({
        key: "mem-mid",
        vector: [0.8, 0.6, 0],
        importance: 0.9,
        created_at: new Date(now - 365 * 86_400_000).toISOString(),
      }),
    ];

    const ranked = await retrieveRelevantMemories("query", {
      ...defaultDeps,
      provider,
      limit: 2,
      loadCandidates: () => candidates,
    });

    expect(ranked).toHaveLength(2);
    expect(ranked[0].key).toBe("mem-close");
    expect(ranked.map(r => r.key)).toContain("mem-mid");
    expect(ranked.map(r => r.key)).not.toContain("mem-far");
    for (const r of ranked) {
      expect(typeof r.score).toBe("number");
      expect(r.vector).toBeInstanceOf(Float32Array);
    }
  });

  it("skips candidates whose embedding length does not match the query vector", async () => {
    const provider = makeProvider({ embed: async () => Float32Array.from([1, 0, 0]) });
    const candidates = [
      makeMemory({ key: "wrong-dim", vector: [1, 0] }),
      makeMemory({ key: "right-dim", vector: [1, 0, 0] }),
    ];
    const ranked = await retrieveRelevantMemories("query", {
      ...defaultDeps,
      provider,
      loadCandidates: () => candidates,
    });
    expect(ranked.map(r => r.key)).toEqual(["right-dim"]);
  });

  it("treats null importance as default 0.5 in the score", async () => {
    const now = defaultDeps.now;
    const provider = makeProvider({ embed: async () => Float32Array.from([1, 0, 0]) });
    const ranked = await retrieveRelevantMemories("query", {
      ...defaultDeps,
      provider,
      loadCandidates: () => [
        makeMemory({
          key: "no-importance",
          vector: [1, 0, 0],
          importance: null,
          created_at: new Date(now).toISOString(),
        }),
      ],
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].effectiveImportance).toBe(0.5);
  });
});

describe("buildContextBlock", () => {
  const ranked: RankedMemory[] = [
    {
      ...makeMemory({ key: "user-os", vector: [1, 0, 0], content: "arch linux" }),
      vector: Float32Array.from([1, 0, 0]),
      score: 0.9,
      similarity: 1,
      recency: 1,
      effectiveImportance: 0.5,
    },
    {
      ...makeMemory({ key: "project-stack", vector: [1, 0, 0], content: "typescript + node" }),
      vector: Float32Array.from([1, 0, 0]),
      score: 0.6,
      similarity: 0.8,
      recency: 0.5,
      effectiveImportance: 0.5,
    },
  ];

  it("renders a valid memories section within the token budget", () => {
    const block = buildContextBlock(ranked, 500);
    expect(block).toContain("## Your Memories");
    expect(block).toContain("**user-os**: arch linux");
    expect(block).toContain("**project-stack**: typescript + node");
    expect(block).toContain("Use the `memory` tool");
  });

  it("returns empty string when budget is zero or negative", () => {
    expect(buildContextBlock(ranked, 0)).toBe("");
    expect(buildContextBlock(ranked, -5)).toBe("");
  });

  it("returns empty string when memories array is empty", () => {
    expect(buildContextBlock([], 500)).toBe("");
  });

  it("truncates the list when tokens exceed the budget", () => {
    const tight = buildContextBlock(ranked, 80);
    const loose = buildContextBlock(ranked, 500);
    expect(tight.length).toBeLessThan(loose.length);
  });
});
