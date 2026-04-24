import { describe, it, expect, beforeEach, vi } from "vitest";

const getMemoryMock = vi.fn();
const updateEmbeddingMock = vi.fn();
vi.mock("../src/session/manager.js", () => ({
  getMemory: (...args: unknown[]) => getMemoryMock(...args as []),
  updateMemoryEmbedding: (...args: unknown[]) => updateEmbeddingMock(...args as []),
}));

const availableMock = vi.fn(async () => true);
const providerMock = {
  name: "mock",
  model: "mock-embed",
  available: async () => availableMock(),
  embed: vi.fn(async () => Float32Array.from([0.1, 0.2, 0.3])),
};
vi.mock("../src/memory/embeddings/index.js", () => ({
  getEmbeddingProvider: () => providerMock,
  isEmbeddingProviderAvailable: () => availableMock(),
  resetEmbeddingProviderCache: vi.fn(),
  EmbeddingProviderError: class {},
}));

import { ensureEmbedding } from "../src/memory/embed-writer.js";

beforeEach(() => {
  getMemoryMock.mockReset();
  updateEmbeddingMock.mockReset();
  availableMock.mockReset();
  availableMock.mockResolvedValue(true);
  providerMock.embed.mockReset();
  providerMock.embed.mockResolvedValue(Float32Array.from([0.1, 0.2, 0.3]));
});

describe("ensureEmbedding", () => {
  it("returns false when provider is unavailable and does not touch the DB", async () => {
    availableMock.mockResolvedValue(false);
    const ok = await ensureEmbedding("any-key");
    expect(ok).toBe(false);
    expect(getMemoryMock).not.toHaveBeenCalled();
    expect(updateEmbeddingMock).not.toHaveBeenCalled();
    expect(providerMock.embed).not.toHaveBeenCalled();
  });

  it("returns false when the memory does not exist", async () => {
    getMemoryMock.mockReturnValue(undefined);
    const ok = await ensureEmbedding("missing");
    expect(ok).toBe(false);
    expect(providerMock.embed).not.toHaveBeenCalled();
  });

  it("embeds and persists when the memory exists and provider works", async () => {
    getMemoryMock.mockReturnValue({ key: "k", content: "some content" });
    const ok = await ensureEmbedding("k");
    expect(ok).toBe(true);
    expect(providerMock.embed).toHaveBeenCalledWith("some content");
    expect(updateEmbeddingMock).toHaveBeenCalledTimes(1);
    const [key, buf, model] = updateEmbeddingMock.mock.calls[0];
    expect(key).toBe("k");
    expect(buf).toBeInstanceOf(Buffer);
    expect(model).toBe("mock-embed");
  });

  it("returns false without throwing when embed fails", async () => {
    getMemoryMock.mockReturnValue({ key: "k", content: "x" });
    providerMock.embed.mockRejectedValue(new Error("boom"));
    const ok = await ensureEmbedding("k");
    expect(ok).toBe(false);
    expect(updateEmbeddingMock).not.toHaveBeenCalled();
  });
});
