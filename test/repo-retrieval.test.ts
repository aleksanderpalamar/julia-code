import { describe, it, expect, vi } from "vitest";
import { float32ToBuffer } from "../src/memory/similarity.js";
import { retrieveRelevantChunks } from "../src/repo-intel/retrieval.js";
import type { CodeChunk } from "../src/repo-intel/types.js";

function makeChunk(id: number, vec: number[], filePath = `f${id}.ts`): CodeChunk {
  const f32 = Float32Array.from(vec);
  return {
    id,
    file_path: filePath,
    start_line: 1,
    end_line: 10,
    content: `content ${id}`,
    content_hash: `h${id}`,
    file_hash: `fh${id}`,
    language: 'typescript',
    embedding: float32ToBuffer(f32),
    embedding_model: 'mock-embed',
    token_estimate: 50,
    indexed_at: '2026-05-15T00:00:00Z',
  };
}

function provider(queryVec: number[], opts: { fail?: boolean; unavailable?: boolean } = {}) {
  return {
    name: 'mock',
    model: 'mock-embed',
    available: async () => !opts.unavailable,
    embed: async () => {
      if (opts.fail) throw new Error('boom');
      return Float32Array.from(queryVec);
    },
  };
}

describe("retrieveRelevantChunks", () => {
  it("ranks chunks by cosine similarity to query vector", async () => {
    const query = [1, 0, 0];
    const chunks = [
      makeChunk(1, [1, 0, 0]),
      makeChunk(2, [0.2, 0.9, 0.1]),
      makeChunk(3, [0.9, 0.1, 0]),
    ];
    const ranked = await retrieveRelevantChunks("anything", {
      provider: provider(query),
      limit: 3,
      loadCandidates: () => chunks,
    });
    expect(ranked.map(r => r.chunk.id)).toEqual([1, 3, 2]);
    expect(ranked[0].similarity).toBeGreaterThan(ranked[1].similarity);
  });

  it("respects the limit", async () => {
    const query = [1, 0];
    const chunks = [makeChunk(1, [1, 0]), makeChunk(2, [0.9, 0.1]), makeChunk(3, [0.5, 0.5])];
    const ranked = await retrieveRelevantChunks("q", {
      provider: provider(query),
      limit: 2,
      loadCandidates: () => chunks,
    });
    expect(ranked).toHaveLength(2);
  });

  it("returns [] when provider unavailable", async () => {
    const ranked = await retrieveRelevantChunks("q", {
      provider: provider([1, 0], { unavailable: true }),
      limit: 5,
      loadCandidates: () => [makeChunk(1, [1, 0])],
    });
    expect(ranked).toEqual([]);
  });

  it("returns [] when embed fails", async () => {
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const ranked = await retrieveRelevantChunks("q", {
      provider: provider([1, 0], { fail: true }),
      limit: 5,
      loadCandidates: () => [makeChunk(1, [1, 0])],
    });
    expect(ranked).toEqual([]);
    stderrWrite.mockRestore();
  });

  it("returns [] when no candidates have embeddings", async () => {
    const ranked = await retrieveRelevantChunks("q", {
      provider: provider([1, 0]),
      limit: 5,
      loadCandidates: () => [],
    });
    expect(ranked).toEqual([]);
  });

  it("skips chunks with mismatched embedding length", async () => {
    const query = [1, 0, 0];
    const chunks = [
      makeChunk(1, [1, 0, 0]),
      makeChunk(2, [1, 0]),
    ];
    const ranked = await retrieveRelevantChunks("q", {
      provider: provider(query),
      limit: 5,
      loadCandidates: () => chunks,
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].chunk.id).toBe(1);
  });

  it("excludes zero-similarity (orthogonal) chunks", async () => {
    const query = [1, 0];
    const chunks = [makeChunk(1, [1, 0]), makeChunk(2, [0, 0])];
    const ranked = await retrieveRelevantChunks("q", {
      provider: provider(query),
      limit: 5,
      loadCandidates: () => chunks,
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].chunk.id).toBe(1);
  });
});
