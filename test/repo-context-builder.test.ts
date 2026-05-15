import { describe, it, expect } from "vitest";
import { buildRepoContextBlock } from "../src/repo-intel/context-builder.js";
import type { CodeChunk, RankedChunk } from "../src/repo-intel/types.js";

function makeChunk(opts: Partial<CodeChunk> & { id: number; file_path: string; content: string; start_line?: number; end_line?: number }): CodeChunk {
  return {
    id: opts.id,
    file_path: opts.file_path,
    start_line: opts.start_line ?? 1,
    end_line: opts.end_line ?? 10,
    content: opts.content,
    content_hash: `h${opts.id}`,
    file_hash: `fh${opts.id}`,
    language: opts.language ?? 'typescript',
    embedding: null,
    embedding_model: null,
    token_estimate: opts.token_estimate ?? Math.ceil(opts.content.length / 4),
    indexed_at: '2026-05-15T00:00:00Z',
  };
}

function rank(chunks: CodeChunk[]): RankedChunk[] {
  return chunks.map((chunk, i) => ({ chunk, similarity: 1 - i * 0.1, score: 1 - i * 0.1 }));
}

describe("buildRepoContextBlock", () => {
  it("returns empty string for no ranked chunks", () => {
    expect(buildRepoContextBlock([], 1000)).toBe("");
  });

  it("returns empty string when budget is zero or negative", () => {
    const ranked = rank([makeChunk({ id: 1, file_path: 'a.ts', content: 'x' })]);
    expect(buildRepoContextBlock(ranked, 0)).toBe("");
    expect(buildRepoContextBlock(ranked, -5)).toBe("");
  });

  it("returns empty string when budget is below minimum body size", () => {
    const ranked = rank([makeChunk({ id: 1, file_path: 'a.ts', content: 'x' })]);
    expect(buildRepoContextBlock(ranked, 50)).toBe("");
  });

  it("includes preamble and header for each chunk", () => {
    const ranked = rank([
      makeChunk({ id: 1, file_path: 'src/a.ts', content: 'export const a = 1;', start_line: 5, end_line: 5 }),
    ]);
    const block = buildRepoContextBlock(ranked, 1000);
    expect(block).toContain("## Relevant Code from Repository");
    expect(block).toContain("### src/a.ts:5-5");
    expect(block).toContain("```typescript");
    expect(block).toContain("export const a = 1;");
  });

  it("respects the hard cap of 5 chunks", () => {
    const chunks = Array.from({ length: 10 }, (_, i) =>
      makeChunk({ id: i + 1, file_path: `f${i + 1}.ts`, content: `c${i + 1}`, start_line: 1, end_line: 1 }),
    );
    const block = buildRepoContextBlock(rank(chunks), 10_000);
    const headers = block.match(/^### /gm) ?? [];
    expect(headers.length).toBeLessThanOrEqual(5);
  });

  it("merges same-file chunks into one section with widened range", () => {
    const ranked = rank([
      makeChunk({ id: 1, file_path: 'src/a.ts', content: 'first', start_line: 10, end_line: 20 }),
      makeChunk({ id: 2, file_path: 'src/a.ts', content: 'second', start_line: 30, end_line: 40 }),
    ]);
    const block = buildRepoContextBlock(ranked, 5000);
    const headers = block.match(/^### /gm) ?? [];
    expect(headers).toHaveLength(1);
    expect(block).toContain("src/a.ts:10-40");
    expect(block).toContain("first");
    expect(block).toContain("second");
  });

  it("adds truncation marker when content does not fit fully", () => {
    const bigContent = "x".repeat(8000);
    const ranked = rank([makeChunk({ id: 1, file_path: 'big.ts', content: bigContent })]);
    const block = buildRepoContextBlock(ranked, 500);
    expect(block).toContain("[truncated]");
  });
});
