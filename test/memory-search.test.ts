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
import { saveMemory, searchMemories } from "../src/session/manager.js";

describe("searchMemories tokenization", () => {
  beforeEach(() => {
    testDb = new Database(":memory:");
    testDb.pragma("journal_mode = WAL");
    initSchema(testDb);

    saveMemory("user-name", "O nome do usuário é palamar", "user");
    saveMemory("user-fullname", "Nome completo: Aleksander Palamar", "user");
    saveMemory("user-os", "Linux ArchLinux com kernel Zen", "user");
    saveMemory("project-stack", "Next.js, TypeScript, React", "project");
  });

  it("matches a multi-word natural-language query against any token", () => {
    // Reproduces the bug from production: model called recall with
    // "user name identity who" and got 0 hits because the query was
    // matched as a single substring instead of tokenized.
    const hits = searchMemories("user name identity who");
    const keys = hits.map(m => m.key).sort();
    expect(keys).toContain("user-name");
    expect(keys).toContain("user-fullname");
    expect(keys).toContain("user-os");
  });

  it("still works for single-word queries", () => {
    const hits = searchMemories("ArchLinux");
    expect(hits.map(m => m.key)).toEqual(["user-os"]);
  });

  it("ignores tokens shorter than 2 chars and is case-insensitive", () => {
    const hits = searchMemories("a USER ?");
    expect(hits.some(m => m.key === "user-name")).toBe(true);
  });

  it("respects the category filter", () => {
    const hits = searchMemories("user name", "project");
    expect(hits.map(m => m.key)).toEqual([]);
  });

  it("falls back to raw query when tokenization yields nothing", () => {
    saveMemory("punct-key", "?? content with ?? punctuation", "general");
    const hits = searchMemories("??");
    expect(hits.some(m => m.key === "punct-key")).toBe(true);
  });
});
