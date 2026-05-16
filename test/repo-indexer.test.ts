import { describe, it, expect, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";

let testDb: DatabaseSync;
let currentEmbeddingModel = "mock-embed";

vi.mock("../src/config/index.js", () => ({
  getConfig: () => ({
    defaultModel: "test-model",
    dbPath: ":memory:",
    memorySemantic: {
      embeddingModel: currentEmbeddingModel,
    },
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
    get model() { return currentEmbeddingModel; },
    available: async () => true,
    embed: (t: string) => embedMock(t),
  }),
  isEmbeddingProviderAvailable: async () => true,
  resetEmbeddingProviderCache: vi.fn(),
  EmbeddingProviderError: class {},
}));

import { initSchema } from "../src/session/db.js";
import { runIndex } from "../src/repo-intel/indexer.js";
import { countChunks, getChunksByFile, deleteObsoleteChunksForFile } from "../src/repo-intel/storage.js";

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
  currentEmbeddingModel = "mock-embed";
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

  it("preserves embeddings for unchanged chunks within a mutated file", async () => {
    const lines: string[] = [];
    for (let i = 1; i <= 200; i++) lines.push(`line ${i};`);
    fakeFiles.set("src/big.ts", lines.join("\n"));
    await runIndex();

    const beforeChunks = getChunksByFile("src/big.ts");
    expect(beforeChunks.length).toBeGreaterThan(1);
    const initialEmbeds = embedMock.mock.calls.length;
    expect(initialEmbeds).toBe(beforeChunks.length);
    const lastChunk = beforeChunks[beforeChunks.length - 1];
    const originalLastEmbedding = Buffer.from(lastChunk.embedding!);

    lines[0] = "line 1; // changed";
    fakeFiles.set("src/big.ts", lines.join("\n"));
    embedMock.mockClear();
    await runIndex();

    const afterEmbeds = embedMock.mock.calls.length;
    expect(afterEmbeds).toBeGreaterThan(0);
    expect(afterEmbeds).toBeLessThan(beforeChunks.length);

    const afterChunks = getChunksByFile("src/big.ts");
    const lastAfter = afterChunks[afterChunks.length - 1];
    expect(Buffer.from(lastAfter.embedding!).equals(originalLastEmbedding)).toBe(true);
    expect(lastAfter.content).not.toContain("// changed");

    const firstAfter = afterChunks[0];
    expect(firstAfter.content).toContain("// changed");
    expect(Buffer.from(firstAfter.embedding!).equals(originalLastEmbedding)).toBe(false);
  });

  it("re-embeds unchanged files when the embedding model changes", async () => {
    fakeFiles.set("src/a.ts", "export const a = 1;");
    fakeFiles.set("src/b.ts", "export const b = 2;");
    await runIndex();
    expect(embedMock).toHaveBeenCalledTimes(2);

    const beforeA = getChunksByFile("src/a.ts")[0];
    expect(beforeA.embedding_model).toBe("mock-embed");

    currentEmbeddingModel = "mock-embed-v2";
    embedMock.mockClear();
    await runIndex();

    expect(embedMock).toHaveBeenCalledTimes(2);
    const afterA = getChunksByFile("src/a.ts")[0];
    const afterB = getChunksByFile("src/b.ts")[0];
    expect(afterA.embedding_model).toBe("mock-embed-v2");
    expect(afterB.embedding_model).toBe("mock-embed-v2");
    expect(afterA.embedding).not.toBeNull();
    expect(afterB.embedding).not.toBeNull();
  });

  it("removes chunks whose ranges no longer exist when a file shrinks", async () => {
    const longLines = Array.from({ length: 200 }, (_, i) => `line ${i + 1};`);
    fakeFiles.set("src/big.ts", longLines.join("\n"));
    await runIndex();
    const longCount = getChunksByFile("src/big.ts").length;
    expect(longCount).toBeGreaterThan(1);

    fakeFiles.set("src/big.ts", longLines.slice(0, 30).join("\n"));
    await runIndex();
    const shortCount = getChunksByFile("src/big.ts").length;
    expect(shortCount).toBe(1);
  });
});

describe("deleteObsoleteChunksForFile", () => {
  it("deletes obsolete chunks without exceeding the SQLite variable limit", () => {
    // A single `NOT IN (VALUES ...)` binds 2 params per kept range; 17000
    // ranges = 34001 params, over SQLITE_MAX_VARIABLE_NUMBER (32766). The
    // id-batched implementation must handle this without throwing.
    const total = 20000;
    const keepCount = 17000;
    const insert = testDb.prepare(
      `INSERT INTO code_chunks
         (file_path, start_line, end_line, content, content_hash, file_hash, language, token_estimate)
       VALUES ('src/huge.ts', ?, ?, '', ?, 'fh', 'typescript', 0)`,
    );
    testDb.exec("BEGIN");
    for (let i = 0; i < total; i++) insert.run(i + 1, i + 1, `ch${i}`);
    testDb.exec("COMMIT");

    const keep: Array<[number, number]> = [];
    for (let i = 0; i < keepCount; i++) keep.push([i + 1, i + 1]);

    const removed = deleteObsoleteChunksForFile("src/huge.ts", keep);
    expect(removed).toBe(total - keepCount);
    expect(getChunksByFile("src/huge.ts")).toHaveLength(keepCount);
  });
});
