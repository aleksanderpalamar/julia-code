import { describe, it, expect, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";

let testDb: DatabaseSync;

vi.mock("../src/config/index.js", () => ({
  getConfig: () => ({
    defaultModel: "test-model",
    dbPath: ":memory:",
  }),
}));

vi.mock("../src/session/db.js", async () => {
  const actual = await vi.importActual<typeof import("../src/session/db.js")>("../src/session/db.js");
  return {
    ...actual,
    getDb: () => testDb,
  };
});

const fakeFiles = new Map<string, string>();
let isGitRepo = true;

vi.mock("../src/repo-intel/file-scanner.js", () => ({
  listIndexableFiles: () => ({
    files: [...fakeFiles.keys()],
    skippedBinary: 0,
    skippedLarge: 0,
    skippedOverCap: 0,
    isGitRepo,
  }),
  readFileSafe: (abs: string) => {
    const rel = [...fakeFiles.keys()].find(k => abs.endsWith(k));
    return rel ? fakeFiles.get(rel) ?? null : null;
  },
  languageFromPath: (path: string) => {
    if (path.endsWith(".ts")) return "typescript";
    if (path.endsWith(".md")) return "markdown";
    return null;
  },
}));

let embedCalls = 0;
const embedMock = vi.fn(async (_text: string) => {
  embedCalls++;
  return Float32Array.from([0.1 * embedCalls, 0.2 * embedCalls]);
});
vi.mock("../src/memory/embeddings/index.js", () => ({
  getEmbeddingProvider: () => ({
    name: "mock",
    model: "mock-embed",
    available: async () => true,
    embed: (t: string) => embedMock(t),
  }),
  isEmbeddingProviderAvailable: async () => true,
  resetEmbeddingProviderCache: vi.fn(),
  EmbeddingProviderError: class {},
}));

import { initSchema } from "../src/session/db.js";
import { runIndex } from "../src/repo-intel/indexer.js";
import { countChunks, getChunksByFile } from "../src/repo-intel/storage.js";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

beforeEach(() => {
  testDb = freshDb();
  initSchema(testDb);
  fakeFiles.clear();
  isGitRepo = true;
  embedCalls = 0;
  embedMock.mockClear();
});

describe("runIndex", () => {
  it("indexes fake files and embeds chunks", async () => {
    fakeFiles.set("src/a.ts", "export const a = 1;\nexport const b = 2;");
    fakeFiles.set("src/b.ts", "export function f() { return 1; }");
    fakeFiles.set("README.md", "# Title\n\nBody");

    const result = await runIndex();

    expect(result.reason).toBe("completed");
    expect(result.filesIndexed).toBe(3);
    expect(countChunks()).toBe(3);
    expect(result.chunksEmbedded).toBe(3);
    expect(embedMock).toHaveBeenCalledTimes(3);

    const aChunks = getChunksByFile("src/a.ts");
    expect(aChunks).toHaveLength(1);
    expect(aChunks[0].language).toBe("typescript");
    expect(aChunks[0].embedding).not.toBeNull();
  });

  it("does not re-embed identical files on second run", async () => {
    fakeFiles.set("src/a.ts", "export const a = 1;");
    await runIndex();
    expect(embedMock).toHaveBeenCalledTimes(1);

    embedMock.mockClear();
    const second = await runIndex();

    expect(second.reason).toBe("completed");
    expect(second.chunksTotal).toBe(0);
    expect(embedMock).not.toHaveBeenCalled();
    expect(countChunks()).toBe(1);
  });

  it("re-embeds only the mutated file", async () => {
    fakeFiles.set("src/a.ts", "export const a = 1;");
    fakeFiles.set("src/b.ts", "export const b = 2;");
    await runIndex();
    expect(embedMock).toHaveBeenCalledTimes(2);

    fakeFiles.set("src/a.ts", "export const a = 99;");
    embedMock.mockClear();
    await runIndex();

    expect(embedMock).toHaveBeenCalledTimes(1);
    const aChunks = getChunksByFile("src/a.ts");
    const bChunks = getChunksByFile("src/b.ts");
    expect(aChunks[0].content).toContain("99");
    expect(bChunks[0].content).toContain("export const b = 2");
  });

  it("removes chunks for files no longer tracked", async () => {
    fakeFiles.set("src/a.ts", "a");
    fakeFiles.set("src/b.ts", "b");
    await runIndex();
    expect(countChunks()).toBe(2);

    fakeFiles.delete("src/b.ts");
    await runIndex();
    expect(countChunks()).toBe(1);
    expect(getChunksByFile("src/b.ts")).toHaveLength(0);
  });

  it("returns not-a-repo when git is unavailable", async () => {
    isGitRepo = false;
    const result = await runIndex();
    expect(result.reason).toBe("not-a-repo");
    expect(countChunks()).toBe(0);
  });
});
