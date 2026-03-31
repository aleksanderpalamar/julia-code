import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import type { ChatChunk } from "../src/providers/types.js";
import {
  createSession,
  getSession,
  listSessions,
  updateSessionTitle,
  addMessage,
  getMessageCount,
} from "../src/session/manager.js";
import { AgentLoop } from "../src/agent/loop.js";

vi.mock("../src/config/index.js", () => ({
  getConfig: () => ({
    defaultModel: "test-model",
    dbPath: ":memory:",
    acpEnabled: false,
    acpAutoOrchestrate: false,
    maxToolIterations: 1,
    compactionThreshold: 99999,
    compactionKeepRecent: 10,
  }),
  loadConfig: () => ({
    defaultModel: "test-model",
    dbPath: ":memory:",
  }),
}));

let testDb: Database.Database;

vi.mock("../src/session/db.js", () => ({
  getDb: () => testDb,
  closeDb: () => {
    if (testDb) {
      testDb.close();
    }
  },
}));

let mockChatResponse: ChatChunk[] = [];

vi.mock("../src/providers/registry.js", () => ({
  getProvider: () => ({
    name: "mock-ollama",
    async *chat() {
      for (const chunk of mockChatResponse) {
        yield chunk;
      }
    },
  }),
  registerProvider: vi.fn(),
  initProviders: vi.fn(),
}));

vi.mock("../src/tools/registry.js", () => ({
  getToolSchemas: () => [],
  executeTool: vi.fn(),
}));

vi.mock("../src/agent/context.js", () => ({
  buildContext: () => [],
  getCompactableMessages: async () => null,
  getEmergencyCompactableMessages: async () => null,
}));

vi.mock("../src/security/boundaries.js", () => ({
  wrapToolResult: (_name: string, text: string) => text,
}));
vi.mock("../src/security/sanitize.js", () => ({
  sanitizeToolResult: (text: string) => text,
}));
vi.mock("../src/security/permissions.js", () => ({
  getToolRisk: () => "low",
  isBlockedCommand: () => false,
  matchesAllowRule: () => false,
}));

vi.mock("../src/tools/memory.js", () => ({
  setCurrentSessionId: vi.fn(),
}));
vi.mock("../src/tools/subagent.js", () => ({
  setSubagentSessionId: vi.fn(),
}));
vi.mock("../src/agent/subagent.js", () => ({
  getSubagentManager: () => ({}),
}));
vi.mock("../src/providers/ollama.js", () => ({
  listOllamaModels: async () => [],
}));
vi.mock("../src/context/budget.js", () => ({
  computeToolResultCap: () => 12000,
}));
vi.mock("../src/context/health.js", () => ({
  shouldEmergencyCompact: () => false,
  getEmergencyKeepCount: () => 4,
  getToolResultCapFactor: () => 1,
}));
vi.mock("../src/context/compaction.js", () => ({
  performStructuredCompaction: vi.fn(),
  serializeCompaction: vi.fn(),
  deserializeCompaction: vi.fn(),
}));

function initTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Session',
      model TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      total_tokens INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'tool')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_call_id TEXT,
      images TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
  `);
  return db;
}

describe("Session Title Persistence", () => {
  beforeEach(() => {
    testDb = initTestDb();
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
    }
  });

  it('should create session with default title "New Session"', () => {
    const session = createSession();

    expect(session).toBeDefined();
    expect(session.id).toBeTruthy();
    expect(session.title).toBe("New Session");
    expect(session.model).toBe("test-model");
  });

  it("should create session with custom title", () => {
    const session = createSession("Meu Projeto REST API");

    expect(session.title).toBe("Meu Projeto REST API");

    const fetched = getSession(session.id);
    expect(fetched).toBeDefined();
    expect(fetched!.title).toBe("Meu Projeto REST API");
  });

  it("should update session title and persist to database", () => {
    const session = createSession();
    expect(session.title).toBe("New Session");

    updateSessionTitle(session.id, "REST Server com 3 Endpoints");

    const updated = getSession(session.id);
    expect(updated).toBeDefined();
    expect(updated!.title).toBe("REST Server com 3 Endpoints");
  });

  it("should retrieve updated title via getSession after title change", () => {
    const session = createSession();

    const generatedTitle = "Building Express API";
    updateSessionTitle(session.id, generatedTitle);

    const retrieved = getSession(session.id);
    expect(retrieved!.title).toBe(generatedTitle);
    expect(retrieved!.id).toBe(session.id);
  });

  it("should keep multiple sessions with independent titles", () => {
    const s1 = createSession();
    const s2 = createSession();
    const s3 = createSession();

    updateSessionTitle(s1.id, "Session Alpha");
    updateSessionTitle(s2.id, "Session Beta");
    updateSessionTitle(s3.id, "Session Gamma");

    expect(getSession(s1.id)!.title).toBe("Session Alpha");
    expect(getSession(s2.id)!.title).toBe("Session Beta");
    expect(getSession(s3.id)!.title).toBe("Session Gamma");

    const all = listSessions();
    expect(all).toHaveLength(3);
  });

  it("should allow updating title to empty string", () => {
    const session = createSession("Initial Title");
    updateSessionTitle(session.id, "");

    const updated = getSession(session.id);
    expect(updated!.title).toBe("");
  });
});

describe("Session Title Generation Flow (maybeGenerateTitle)", () => {
  beforeEach(() => {
    testDb = initTestDb();
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
    }
  });

  it("should auto-generate title after first user interaction", async () => {
    const session = createSession();
    expect(session.title).toBe("New Session");

    addMessage(session.id, "user", "create a REST server with 3 endpoints");
    addMessage(
      session.id,
      "assistant",
      "Sure! I will create a REST server with Express...",
    );

    expect(getMessageCount(session.id)).toBe(2);

    mockChatResponse = [
      { type: "text", text: "REST Server" },
      { type: "text", text: " Setup" },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    await (agent as any).maybeGenerateTitle(
      session.id,
      "test-model",
      "create a REST server with 3 endpoints",
      "Sure! I will create a REST server with Express...",
    );

    const updated = getSession(session.id);
    expect(updated!.title).not.toBe("New Session");
    expect(updated!.title).toBe("REST Server Setup");
  });

  it("should NOT overwrite title if session already has a custom title", async () => {
    const session = createSession("My Custom Title");

    addMessage(session.id, "user", "hello");
    addMessage(session.id, "assistant", "Hi there!");

    mockChatResponse = [
      { type: "text", text: "Greeting Chat" },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    await (agent as any).maybeGenerateTitle(
      session.id,
      "test-model",
      "hello",
      "Hi there!",
    );

    const updated = getSession(session.id);
    expect(updated!.title).toBe("My Custom Title");
  });

  it("should NOT generate title if message count exceeds threshold", async () => {
    const session = createSession();

    addMessage(session.id, "user", "first message");
    addMessage(session.id, "assistant", "first reply");
    addMessage(session.id, "user", "second message");
    addMessage(session.id, "assistant", "second reply");
    addMessage(session.id, "user", "third message");

    expect(getMessageCount(session.id)).toBe(5);

    mockChatResponse = [
      { type: "text", text: "Should Not Appear" },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    await (agent as any).maybeGenerateTitle(
      session.id,
      "test-model",
      "third message",
      "third reply",
    );

    const updated = getSession(session.id);
    expect(updated!.title).toBe("New Session");
  });

  it("should strip quotes from model-generated title", async () => {
    const session = createSession();
    addMessage(session.id, "user", "build a todo app");
    addMessage(session.id, "assistant", "I will build a todo app...");

    mockChatResponse = [
      { type: "text", text: '"Todo App Development"' },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    await (agent as any).maybeGenerateTitle(
      session.id,
      "test-model",
      "build a todo app",
      "I will build a todo app...",
    );

    const updated = getSession(session.id);
    expect(updated!.title).toBe("Todo App Development");
  });

  it("should not update title if model returns an error chunk", async () => {
    const session = createSession();
    addMessage(session.id, "user", "hello");
    addMessage(session.id, "assistant", "hi");

    mockChatResponse = [{ type: "error", error: "model not found" }];

    const agent = new AgentLoop();
    await (agent as any).maybeGenerateTitle(
      session.id,
      "test-model",
      "hello",
      "hi",
    );

    const updated = getSession(session.id);
    expect(updated!.title).toBe("New Session");
  });

  it("should emit title event when title is generated", async () => {
    const session = createSession();
    addMessage(session.id, "user", "explain async await");
    addMessage(session.id, "assistant", "Async/await is a pattern...");

    mockChatResponse = [
      { type: "text", text: "Async Await Explained" },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const emittedTitles: string[] = [];
    agent.on("title", (title) => emittedTitles.push(title));

    await (agent as any).maybeGenerateTitle(
      session.id,
      "test-model",
      "explain async await",
      "Async/await is a pattern...",
    );

    expect(emittedTitles).toHaveLength(1);
    expect(emittedTitles[0]).toBe("Async Await Explained");

    const updated = getSession(session.id);
    expect(updated!.title).toBe("Async Await Explained");
  });
});
