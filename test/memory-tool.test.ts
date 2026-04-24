import { describe, it, expect, beforeEach, vi } from "vitest";

const mockConfig = {
  memorySemantic: {
    enabled: false,
    provider: "ollama" as "ollama" | "null",
    embeddingModel: "nomic-embed-text",
    rankingWeights: { similarity: 0.6, importance: 0.3, recency: 0.1 },
    recencyHalflifeDays: 30,
    maxMemories: 5,
    availabilityCheckTtlMs: 30_000,
    autoBackfillOnStart: false,
  },
};
vi.mock("../src/config/index.js", () => ({
  getConfig: () => mockConfig,
}));

const saveMemoryMock = vi.fn((key: string, content: string, category: string) => ({
  id: 1,
  key,
  content,
  category,
  source_session_id: null,
  created_at: "2026-04-24T00:00:00Z",
  updated_at: "2026-04-24T00:00:00Z",
}));
const searchMemoriesMock = vi.fn(() => [] as Array<{ key: string; content: string; category: string; updated_at: string }>);
const listMemoriesMock = vi.fn(() => [] as Array<{ key: string; content: string; category: string }>);
const deleteMemoryMock = vi.fn(() => true);

vi.mock("../src/session/manager.js", () => ({
  saveMemory: (...args: unknown[]) => saveMemoryMock(...args as Parameters<typeof saveMemoryMock>),
  searchMemories: (...args: unknown[]) => searchMemoriesMock(...args as []),
  listMemories: (...args: unknown[]) => listMemoriesMock(...args as []),
  deleteMemory: (...args: unknown[]) => deleteMemoryMock(...args as []),
}));

const ensureEmbeddingMock = vi.fn(async () => true);
vi.mock("../src/memory/embed-writer.js", () => ({
  ensureEmbedding: (...args: unknown[]) => ensureEmbeddingMock(...args as []),
}));

const availableMock = vi.fn(async () => true);
const getProviderMock = vi.fn(() => ({
  name: "mock",
  model: "mock-embed",
  available: async () => availableMock(),
  embed: async () => Float32Array.from([1, 0, 0]),
}));
vi.mock("../src/memory/embeddings/index.js", () => ({
  getEmbeddingProvider: () => getProviderMock(),
  isEmbeddingProviderAvailable: () => availableMock(),
  resetEmbeddingProviderCache: vi.fn(),
  EmbeddingProviderError: class {},
}));

const retrieveMock = vi.fn(async () => [] as Array<{ key: string; content: string; category: string; updated_at: string; score: number }>);
vi.mock("../src/memory/retrieval.js", () => ({
  retrieveRelevantMemories: (...args: unknown[]) => retrieveMock(...args as []),
}));

import { memoryTool } from "../src/tools/memory.js";

function reset() {
  mockConfig.memorySemantic.enabled = false;
  saveMemoryMock.mockClear();
  searchMemoriesMock.mockClear();
  searchMemoriesMock.mockReturnValue([]);
  listMemoriesMock.mockClear();
  listMemoriesMock.mockReturnValue([]);
  deleteMemoryMock.mockClear();
  deleteMemoryMock.mockReturnValue(true);
  ensureEmbeddingMock.mockClear();
  ensureEmbeddingMock.mockResolvedValue(true);
  availableMock.mockClear();
  availableMock.mockResolvedValue(true);
  retrieveMock.mockClear();
  retrieveMock.mockResolvedValue([]);
}

beforeEach(reset);

describe("memoryTool.save", () => {
  it("persists synchronously and does NOT call ensureEmbedding when semantic flag is off", async () => {
    mockConfig.memorySemantic.enabled = false;
    const res = await memoryTool.execute({ action: "save", key: "k", content: "v", category: "user" });
    expect(res.success).toBe(true);
    expect(saveMemoryMock).toHaveBeenCalledTimes(1);
    expect(ensureEmbeddingMock).not.toHaveBeenCalled();
  });

  it("persists synchronously and fires ensureEmbedding(key) when semantic flag is on", async () => {
    mockConfig.memorySemantic.enabled = true;
    const res = await memoryTool.execute({ action: "save", key: "k", content: "v" });
    expect(res.success).toBe(true);
    expect(saveMemoryMock).toHaveBeenCalledTimes(1);
    expect(ensureEmbeddingMock).toHaveBeenCalledWith("k");
  });

  it("rejects when key or content are missing", async () => {
    const r1 = await memoryTool.execute({ action: "save", key: "", content: "x" });
    const r2 = await memoryTool.execute({ action: "save", key: "k", content: "" });
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
  });
});

describe("memoryTool.recall", () => {
  it("falls back to keyword search when semantic flag is off", async () => {
    mockConfig.memorySemantic.enabled = false;
    searchMemoriesMock.mockReturnValue([
      { key: "user-os", content: "arch", category: "user", updated_at: "2026-04-24T00:00:00Z" },
    ]);
    const res = await memoryTool.execute({ action: "recall", query: "OS" });
    expect(res.success).toBe(true);
    expect(res.output).toContain("1 memories found:");
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it("uses semantic search by default when flag on and provider available", async () => {
    mockConfig.memorySemantic.enabled = true;
    availableMock.mockResolvedValue(true);
    retrieveMock.mockResolvedValue([
      { key: "user-os", content: "arch", category: "user", updated_at: "2026-04-24T00:00:00Z", score: 0.87 },
    ] as Array<{ key: string; content: string; category: string; updated_at: string; score: number }>);
    const res = await memoryTool.execute({ action: "recall", query: "operating system" });
    expect(res.success).toBe(true);
    expect(res.output).toContain("memories found (semantic)");
    expect(res.output).toContain("score: 0.870");
    expect(searchMemoriesMock).not.toHaveBeenCalled();
  });

  it("honors explicit semantic=false even when provider is available", async () => {
    mockConfig.memorySemantic.enabled = true;
    availableMock.mockResolvedValue(true);
    searchMemoriesMock.mockReturnValue([
      { key: "k", content: "v", category: "user", updated_at: "2026-04-24T00:00:00Z" },
    ]);
    const res = await memoryTool.execute({ action: "recall", query: "q", semantic: false });
    expect(res.success).toBe(true);
    expect(res.output).toContain("1 memories found:");
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it("falls back to keyword when semantic requested but provider unavailable", async () => {
    mockConfig.memorySemantic.enabled = true;
    availableMock.mockResolvedValue(false);
    searchMemoriesMock.mockReturnValue([
      { key: "fallback", content: "v", category: "user", updated_at: "2026-04-24T00:00:00Z" },
    ]);
    const res = await memoryTool.execute({ action: "recall", query: "q", semantic: true });
    expect(res.success).toBe(true);
    expect(res.output).toContain("**fallback**: v");
    expect(retrieveMock).not.toHaveBeenCalled();
  });

  it("falls back to keyword when semantic returns zero ranked results", async () => {
    mockConfig.memorySemantic.enabled = true;
    availableMock.mockResolvedValue(true);
    retrieveMock.mockResolvedValue([]);
    searchMemoriesMock.mockReturnValue([
      { key: "kw", content: "keyword-match", category: "user", updated_at: "2026-04-24T00:00:00Z" },
    ]);
    const res = await memoryTool.execute({ action: "recall", query: "q" });
    expect(res.output).toContain("**kw**: keyword-match");
    expect(res.output).not.toContain("(semantic)");
  });

  it("filters semantic results by category when provided", async () => {
    mockConfig.memorySemantic.enabled = true;
    availableMock.mockResolvedValue(true);
    retrieveMock.mockResolvedValue([
      { key: "a", content: "x", category: "user", updated_at: "t", score: 0.5 },
      { key: "b", content: "y", category: "project", updated_at: "t", score: 0.9 },
    ]);
    const res = await memoryTool.execute({ action: "recall", query: "q", category: "project" });
    expect(res.output).toContain("**b**: y");
    expect(res.output).not.toContain("**a**: x");
  });

  it("rejects missing query", async () => {
    const res = await memoryTool.execute({ action: "recall", query: "" });
    expect(res.success).toBe(false);
  });
});
