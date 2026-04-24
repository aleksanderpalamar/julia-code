import { describe, it, expect, beforeEach, vi } from "vitest";

type SemanticConfigPartial = {
  enabled: boolean;
  provider: "ollama" | "null";
  embeddingModel: string;
  rankingWeights: { similarity: number; importance: number; recency: number };
  recencyHalflifeDays: number;
  maxMemories: number;
  availabilityCheckTtlMs: number;
  autoBackfillOnStart: boolean;
};

const mockConfig = {
  memorySemantic: {
    enabled: false,
    provider: "ollama",
    embeddingModel: "nomic-embed-text",
    rankingWeights: { similarity: 0.6, importance: 0.3, recency: 0.1 },
    recencyHalflifeDays: 30,
    maxMemories: 5,
    availabilityCheckTtlMs: 30_000,
    autoBackfillOnStart: false,
  } as SemanticConfigPartial,
};

vi.mock("../src/config/index.js", () => ({
  getConfig: () => mockConfig,
}));

const recentMemoriesMock = vi.fn(() => [] as Array<{ key: string; content: string; category: string }>);
vi.mock("../src/session/manager.js", () => ({
  getRecentMemories: (...args: unknown[]) => recentMemoriesMock(...args as []),
}));

const isAvailableMock = vi.fn(async () => false);
const getProviderMock = vi.fn(() => ({
  name: "mock",
  model: "mock-embed",
  available: async () => true,
  embed: async () => Float32Array.from([1, 0, 0]),
}));
vi.mock("../src/memory/embeddings/index.js", () => ({
  getEmbeddingProvider: () => getProviderMock(),
  isEmbeddingProviderAvailable: () => isAvailableMock(),
  resetEmbeddingProviderCache: vi.fn(),
  EmbeddingProviderError: class {},
}));

const retrieveMock = vi.fn(async () => [] as Array<unknown>);
vi.mock("../src/memory/retrieval.js", () => ({
  retrieveRelevantMemories: (...args: unknown[]) => retrieveMock(...args as []),
}));

import { prepareMemoryContext, legacyRecentMemoriesBlock } from "../src/memory/pipeline.js";

beforeEach(() => {
  mockConfig.memorySemantic.enabled = false;
  mockConfig.memorySemantic.provider = "ollama";
  recentMemoriesMock.mockReset();
  recentMemoriesMock.mockReturnValue([]);
  isAvailableMock.mockReset();
  isAvailableMock.mockResolvedValue(false);
  retrieveMock.mockReset();
  retrieveMock.mockResolvedValue([]);
});

describe("prepareMemoryContext", () => {
  it("returns '' when budget is 0 or negative", async () => {
    expect(await prepareMemoryContext("s", "qual meu OS?", 0)).toBe("");
    expect(await prepareMemoryContext("s", "qual meu OS?", -10)).toBe("");
  });

  it("flag off → returns legacy block (recent memories)", async () => {
    mockConfig.memorySemantic.enabled = false;
    recentMemoriesMock.mockReturnValue([
      { key: "user-os", content: "arch", category: "user" },
    ]);
    const out = await prepareMemoryContext("s", "qual meu OS?", 500);
    expect(out).toContain("## Your Memories");
    expect(out).toContain("**user-os**: arch");
    expect(isAvailableMock).not.toHaveBeenCalled();
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it("flag off + no memories → returns ''", async () => {
    mockConfig.memorySemantic.enabled = false;
    recentMemoriesMock.mockReturnValue([]);
    expect(await prepareMemoryContext("s", "qual meu OS?", 500)).toBe("");
  });

  it("flag on + gating skips greeting → returns ''", async () => {
    mockConfig.memorySemantic.enabled = true;
    const out = await prepareMemoryContext("s", "oi!", 500);
    expect(out).toBe("");
    expect(isAvailableMock).not.toHaveBeenCalled();
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it("flag on + no user input → falls back to legacy", async () => {
    mockConfig.memorySemantic.enabled = true;
    recentMemoriesMock.mockReturnValue([
      { key: "k", content: "v", category: "user" },
    ]);
    const out = await prepareMemoryContext("s", null, 500);
    expect(out).toContain("**k**: v");
  });

  it("flag on + provider unavailable → falls back to legacy", async () => {
    mockConfig.memorySemantic.enabled = true;
    isAvailableMock.mockResolvedValue(false);
    recentMemoriesMock.mockReturnValue([
      { key: "fallback-key", content: "fb", category: "user" },
    ]);
    const out = await prepareMemoryContext("s", "qual meu OS?", 500);
    expect(out).toContain("**fallback-key**: fb");
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it("flag on + provider available + zero ranked → falls back to legacy", async () => {
    mockConfig.memorySemantic.enabled = true;
    isAvailableMock.mockResolvedValue(true);
    retrieveMock.mockResolvedValue([]);
    recentMemoriesMock.mockReturnValue([
      { key: "legacy-k", content: "legacy-v", category: "user" },
    ]);
    const out = await prepareMemoryContext("s", "qual meu OS?", 500);
    expect(out).toContain("**legacy-k**: legacy-v");
    expect(retrieveMock).toHaveBeenCalledOnce();
  });

  it("flag on + ranked results → returns semantic block instead of legacy", async () => {
    mockConfig.memorySemantic.enabled = true;
    isAvailableMock.mockResolvedValue(true);
    retrieveMock.mockResolvedValue([
      {
        id: 1,
        key: "user-os",
        content: "arch linux",
        category: "user",
        source_session_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        embedding: Buffer.alloc(12),
        embedding_model: "nomic-embed-text",
        importance: 0.5,
        last_accessed_at: null,
        vector: Float32Array.from([1, 0, 0]),
        similarity: 1,
        recency: 1,
        effectiveImportance: 0.5,
        score: 0.9,
      },
    ]);
    recentMemoriesMock.mockReturnValue([
      { key: "should-not-show", content: "legacy", category: "user" },
    ]);
    const out = await prepareMemoryContext("s", "qual meu OS?", 500);
    expect(out).toContain("**user-os**: arch linux");
    expect(out).not.toContain("should-not-show");
  });
});

describe("legacyRecentMemoriesBlock", () => {
  it("returns '' when no memories", () => {
    recentMemoriesMock.mockReturnValue([]);
    expect(legacyRecentMemoriesBlock(500)).toBe("");
  });

  it("respects the token budget by cutting lines", () => {
    recentMemoriesMock.mockReturnValue([
      { key: "k1", content: "a".repeat(400), category: "user" },
      { key: "k2", content: "b".repeat(400), category: "user" },
      { key: "k3", content: "c".repeat(400), category: "user" },
    ]);
    const tight = legacyRecentMemoriesBlock(120);
    const loose = legacyRecentMemoriesBlock(1000);
    expect(loose.length).toBeGreaterThan(tight.length);
  });
});
