import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";

let testDb: Database.Database;

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

import { initSchema } from "../src/session/db.js";
import {
  saveMemory,
  getMemory,
  updateMemoryEmbedding,
  getEmbeddedMemories,
  getMemoriesWithoutEmbedding,
} from "../src/session/manager.js";

function openLegacyMemoriesDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      source_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

describe("memories schema migration", () => {
  beforeEach(() => {
    testDb = openLegacyMemoriesDb();
  });

  it("adds embedding, embedding_model, importance, and last_accessed_at columns to a legacy memories table", () => {
    testDb.prepare(
      "INSERT INTO memories (key, content, category) VALUES ('legacy-key', 'legacy content', 'user')"
    ).run();

    initSchema(testDb);

    const cols = testDb.pragma("table_info(memories)") as Array<{ name: string; type: string }>;
    const names = cols.map(c => c.name).sort();
    expect(names).toContain("embedding");
    expect(names).toContain("embedding_model");
    expect(names).toContain("importance");
    expect(names).toContain("last_accessed_at");

    const existing = testDb.prepare("SELECT * FROM memories WHERE key = ?").get("legacy-key") as {
      content: string;
      embedding: Buffer | null;
      importance: number | null;
    };
    expect(existing.content).toBe("legacy content");
    expect(existing.embedding).toBeNull();
    expect(existing.importance).toBeNull();
  });

  it("is idempotent: running initSchema twice does not throw", () => {
    initSchema(testDb);
    expect(() => initSchema(testDb)).not.toThrow();
  });

  it("classic saveMemory(key, content, category, sourceSessionId) still works after migration", () => {
    initSchema(testDb);

    const mem = saveMemory("user-os", "arch linux", "user", "session-abc");
    expect(mem.key).toBe("user-os");
    expect(mem.content).toBe("arch linux");
    expect(mem.category).toBe("user");
    expect(mem.source_session_id).toBe("session-abc");
    expect(mem.embedding).toBeNull();
    expect(mem.importance).toBeNull();
  });

  it("saveMemory accepts options object with embedding/importance and persists them", () => {
    initSchema(testDb);

    const embedding = Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer);
    const mem = saveMemory("user-lang", "prefers pt-br", "user", {
      sourceSessionId: "s1",
      embedding,
      embeddingModel: "nomic-embed-text",
      importance: 0.9,
    });

    expect(mem.embedding).toBeInstanceOf(Buffer);
    expect(Buffer.from(mem.embedding!).equals(embedding)).toBe(true);
    expect(mem.embedding_model).toBe("nomic-embed-text");
    expect(mem.importance).toBe(0.9);
  });

  it("re-saving with text-only opts preserves existing embedding (COALESCE)", () => {
    initSchema(testDb);

    const embedding = Buffer.from(new Float32Array([1, 2, 3]).buffer);
    saveMemory("k", "v1", "user", { embedding, embeddingModel: "nomic-embed-text", importance: 0.7 });

    saveMemory("k", "v2", "user", "session-x");

    const after = getMemory("k")!;
    expect(after.content).toBe("v2");
    expect(after.embedding).toBeInstanceOf(Buffer);
    expect(Buffer.from(after.embedding!).equals(embedding)).toBe(true);
    expect(after.embedding_model).toBe("nomic-embed-text");
    expect(after.importance).toBe(0.7);
  });

  it("updateMemoryEmbedding writes vector and model on an existing row", () => {
    initSchema(testDb);
    saveMemory("k", "some content");
    const embedding = Buffer.from(new Float32Array([0.4, 0.5, 0.6]).buffer);

    updateMemoryEmbedding("k", embedding, "nomic-embed-text");

    const row = getMemory("k")!;
    expect(Buffer.from(row.embedding!).equals(embedding)).toBe(true);
    expect(row.embedding_model).toBe("nomic-embed-text");
  });

  it("getEmbeddedMemories and getMemoriesWithoutEmbedding partition by embedding presence", () => {
    initSchema(testDb);

    saveMemory("with-emb", "has vec", "user", {
      embedding: Buffer.from(new Float32Array([1]).buffer),
      embeddingModel: "nomic-embed-text",
    });
    saveMemory("without-emb", "no vec", "user");

    const withEmb = getEmbeddedMemories();
    const withoutEmb = getMemoriesWithoutEmbedding();

    expect(withEmb.map(m => m.key)).toEqual(["with-emb"]);
    expect(withoutEmb.map(m => m.key)).toEqual(["without-emb"]);
  });
});
