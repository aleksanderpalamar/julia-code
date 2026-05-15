import { describe, it, expect } from "vitest";
import { chunkContent } from "../src/repo-intel/chunker.js";

describe("chunkContent", () => {
  it("returns a single chunk for short content", () => {
    const text = "line 1\nline 2\nline 3";
    const chunks = chunkContent(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(3);
    expect(chunks[0].content).toBe(text);
  });

  it("splits long content into overlapping windows", () => {
    const lines: string[] = [];
    for (let i = 1; i <= 200; i++) lines.push(`l${i}`);
    const text = lines.join("\n");
    const chunks = chunkContent(text, { linesPerChunk: 80, overlapLines: 20 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(80);

    expect(chunks[1].startLine).toBe(61);
    expect(chunks[1].endLine).toBe(140);

    const last = chunks[chunks.length - 1];
    expect(last.endLine).toBe(200);
  });

  it("preserves trailing newline edge cases", () => {
    const chunks = chunkContent("a\nb\n");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(3);
    expect(chunks[0].content).toBe("a\nb\n");
  });

  it("returns empty array for empty input", () => {
    expect(chunkContent("")).toEqual([]);
  });

  it("computes token estimate roughly content.length / 4", () => {
    const text = "abcdefgh";
    const [chunk] = chunkContent(text);
    expect(chunk.tokenEstimate).toBe(2);
  });

  it("step >= 1 even when overlap >= linesPerChunk", () => {
    const text = Array.from({ length: 5 }, (_, i) => `l${i + 1}`).join("\n");
    const chunks = chunkContent(text, { linesPerChunk: 2, overlapLines: 99 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[chunks.length - 1].endLine).toBeLessThanOrEqual(5);
  });
});
