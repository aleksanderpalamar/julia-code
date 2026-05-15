import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let projectDir: string;
let indexedPaths: string[] = [];

vi.mock("../src/config/workspace.js", () => ({
  getProjectDir: () => projectDir,
  getWorkspace: () => projectDir,
  initWorkspace: () => projectDir,
}));

vi.mock("../src/repo-intel/storage.js", () => ({
  getAllFilePaths: () => indexedPaths,
}));

import {
  parseMentions,
  resolveMentionsInPrompt,
  buildMentionContextBlock,
} from "../src/repo-intel/mention-resolver.js";

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "mention-resolver-"));
  indexedPaths = [];
});

function makeFile(rel: string, content: string) {
  const abs = join(projectDir, rel);
  const dir = abs.slice(0, abs.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

describe("parseMentions", () => {
  it("extracts @path from prose", () => {
    expect(parseMentions("explique @src/foo.ts agora")).toEqual(["src/foo.ts"]);
  });

  it("ignores @ inside fenced code blocks", () => {
    const text = "use ```\n@decorator\n``` mas leia @src/real.ts";
    expect(parseMentions(text)).toEqual(["src/real.ts"]);
  });

  it("ignores @ inside inline code", () => {
    expect(parseMentions("`@decorator` vs @src/real.ts")).toEqual(["src/real.ts"]);
  });

  it("ignores email addresses", () => {
    expect(parseMentions("envie pra user@example.com")).toEqual([]);
  });

  it("dedupes repeated mentions", () => {
    expect(parseMentions("@a.ts @a.ts @b.ts")).toEqual(["a.ts", "b.ts"]);
  });

  it("matches mention after open paren or bracket", () => {
    expect(parseMentions("(@a.ts) [@b.ts]")).toEqual(["a.ts", "b.ts"]);
  });
});

describe("resolveMentionsInPrompt", () => {
  it("resolves a real file to its content", async () => {
    makeFile("src/foo.ts", "export const foo = 1;");
    const result = await resolveMentionsInPrompt("read @src/foo.ts");
    expect(result.errors).toEqual([]);
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].content).toBe("export const foo = 1;");
    expect(result.resolved[0].fuzzyMatched).toBe(false);
  });

  it("rejects absolute paths", async () => {
    const result = await resolveMentionsInPrompt("read @/etc/passwd");
    expect(result.resolved).toEqual([]);
    expect(result.errors[0]).toMatch(/absolute/);
  });

  it("rejects ../ traversal", async () => {
    const result = await resolveMentionsInPrompt("read @../../etc/passwd");
    expect(result.resolved).toEqual([]);
    expect(result.errors[0]).toMatch(/traversal/);
  });

  it("fuzzy-matches typos against indexed files", async () => {
    makeFile("src/tui/app.tsx", "<jsx/>");
    indexedPaths = ["src/tui/app.tsx", "src/agent/loop.ts"];
    const result = await resolveMentionsInPrompt("read @app.tsx");
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].relativePath.replace(/\\/g, "/")).toBe("src/tui/app.tsx");
    expect(result.resolved[0].fuzzyMatched).toBe(true);
  });

  it("returns soft error when file not found and no fuzzy match", async () => {
    const result = await resolveMentionsInPrompt("read @nonexistent.ts");
    expect(result.resolved).toEqual([]);
    expect(result.errors[0]).toMatch(/not found/);
  });

  it("truncates files larger than the cap", async () => {
    const big = "x".repeat(60 * 1024);
    makeFile("big.txt", big);
    const result = await resolveMentionsInPrompt("read @big.txt");
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].truncated).toBe(true);
    expect(result.resolved[0].content.length).toBeLessThan(big.length);
  });

  it("rejects binary files by null-byte detection", async () => {
    const bin = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const abs = join(projectDir, "bin.dat");
    writeFileSync(abs, bin);
    const result = await resolveMentionsInPrompt("read @bin.dat");
    expect(result.resolved).toEqual([]);
    expect(result.errors[0]).toMatch(/binary/);
  });

  it("returns empty result for prompts without mentions", async () => {
    const result = await resolveMentionsInPrompt("no mentions here");
    expect(result.resolved).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});

describe("buildMentionContextBlock", () => {
  it("returns empty string for no mentions", () => {
    expect(buildMentionContextBlock([])).toBe("");
  });

  it("formats resolved mentions with fences and headers", () => {
    const block = buildMentionContextBlock([{
      raw: "src/foo.ts",
      absolutePath: "/abs/src/foo.ts",
      relativePath: "src/foo.ts",
      content: "export const x = 1;",
      truncated: false,
      fuzzyMatched: false,
    }]);
    expect(block).toContain("## Files mentioned in user prompt");
    expect(block).toContain("### src/foo.ts");
    expect(block).toContain("```ts");
    expect(block).toContain("export const x = 1;");
  });

  it("labels fuzzy-matched mentions", () => {
    const block = buildMentionContextBlock([{
      raw: "foo",
      absolutePath: "/abs/src/foo.ts",
      relativePath: "src/foo.ts",
      content: "",
      truncated: false,
      fuzzyMatched: true,
    }]);
    expect(block).toContain("resolved from @foo");
  });
});
