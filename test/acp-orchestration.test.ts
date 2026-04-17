import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import type { ChatChunk } from "../src/providers/types.js";
import type { SubagentTask } from "../src/agent/subagent.js";

// --- Mocks ---

vi.mock("../src/config/index.js", () => ({
  getConfig: () => ({
    defaultModel: "test-model",
    dbPath: ":memory:",
    acpEnabled: true,
    acpAutoOrchestrate: true,
    acpMaxConcurrent: 4,
    acpSubagentMaxIterations: 5,
    acpDefaultModel: null,
    acpCancelOnFailure: false,
    maxToolIterations: 1,
    compactionThreshold: 99999,
    compactionKeepRecent: 10,
    toolModel: null,
  }),
  loadConfig: vi.fn(),
}));

let testDb: Database.Database;

vi.mock("../src/session/db.js", () => ({
  getDb: () => testDb,
  closeDb: () => {
    if (testDb) testDb.close();
  },
}));

// Track what the LLM receives and returns
let mockChatResponse: ChatChunk[] = [];
let capturedChatCalls: Array<{ model: string; messages: unknown[] }> = [];

vi.mock("../src/providers/registry.js", () => ({
  getProvider: () => ({
    name: "mock-ollama",
    async *chat(params: { model: string; messages: unknown[] }) {
      capturedChatCalls.push(params);
      for (const chunk of mockChatResponse) {
        yield chunk;
      }
    },
  }),
  registerProvider: vi.fn(),
  initProviders: vi.fn(),
}));

// Track available models for resolution tests
let mockAvailableModels: string[] = [];

vi.mock("../src/providers/ollama.js", () => ({
  listOllamaModels: async () => mockAvailableModels,
}));

// Track subagent spawns
let spawnedTasks: Array<{ task: string; model?: string }> = [];
let mockTaskResults: Map<string, { status: string; result?: string; error?: string }> = new Map();
let taskIdCounter = 0;

function createMockManager() {
  const { EventEmitter } = require("node:events");
  const manager = new EventEmitter();

  manager.prewarm = vi.fn();
  manager.getTask = vi.fn((taskId: string) => {
    const result = mockTaskResults.get(taskId);
    if (!result) return undefined;
    return {
      id: taskId,
      status: result.status,
      result: result.result,
      error: result.error,
      durationMs: 100,
    } as Partial<SubagentTask>;
  });

  manager.spawnMany = vi.fn(
    async (
      _parentSessionId: string,
      tasks: Array<string | { task: string; model?: string }>,
      _runId: string,
    ) => {
      const ids: string[] = [];
      for (const t of tasks) {
        const id = `task-${++taskIdCounter}`;
        const desc = typeof t === "string" ? t : t.task;
        const model = typeof t === "string" ? undefined : t.model;
        spawnedTasks.push({ task: desc, model });
        ids.push(id);

        // Auto-complete tasks after a tick
        mockTaskResults.set(id, {
          status: "completed",
          result: `Result for: ${desc}`,
        });
      }

      // Emit events asynchronously so listeners can catch them
      setTimeout(() => {
        for (const id of ids) {
          manager.emit("task:started", id);
          manager.emit("task:completed", id, `Result for task ${id}`);
        }
      }, 5);

      return ids;
    },
  );

  return manager;
}

let mockManager: ReturnType<typeof createMockManager>;

vi.mock("../src/agent/subagent.js", () => ({
  getSubagentManager: () => mockManager,
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

// --- Imports ---

import { createSession } from "../src/session/manager.js";
import { AgentLoop } from "../src/agent/loop.js";

// --- DB Setup ---

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
    CREATE TABLE IF NOT EXISTS orchestration_runs (
      id TEXT PRIMARY KEY,
      parent_session_id TEXT NOT NULL,
      user_task TEXT NOT NULL,
      subtask_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      duration_ms INTEGER,
      FOREIGN KEY (parent_session_id) REFERENCES sessions(id)
    );
    CREATE TABLE IF NOT EXISTS subagent_runs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      task TEXT NOT NULL,
      model TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      result TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      FOREIGN KEY (run_id) REFERENCES orchestration_runs(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_orchestration_runs_session ON orchestration_runs(parent_session_id);
    CREATE INDEX IF NOT EXISTS idx_subagent_runs_run ON subagent_runs(run_id);
    CREATE TABLE IF NOT EXISTS compactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      messages_start INTEGER NOT NULL,
      messages_end INTEGER NOT NULL,
      format TEXT NOT NULL DEFAULT 'text',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      source_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
  `);
  return db;
}

// --- Tests ---

describe("ACP Complexity Detection", () => {
  beforeEach(() => {
    testDb = initTestDb();
    mockChatResponse = [];
    capturedChatCalls = [];
    mockAvailableModels = [];
    spawnedTasks = [];
    mockTaskResults = new Map();
    taskIdCounter = 0;
    mockManager = createMockManager();
  });

  afterEach(() => {
    if (testDb) testDb.close();
  });

  it("should detect complex task and return true for orchestration", async () => {
    const session = createSession();

    mockChatResponse = [
      {
        type: "text",
        text: JSON.stringify({
          complex: true,
          subtasks: [
            { task: "Create GET /users endpoint", model: null },
            { task: "Create POST /users endpoint", model: null },
            { task: "Create DELETE /users endpoint", model: null },
          ],
        }),
      },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "create a REST server with 3 endpoints",
      "test-model",
    );

    expect(result).toBe(true);
  });

  it("should detect simple task and return false", async () => {
    const session = createSession();

    mockChatResponse = [
      { type: "text", text: '{"complex": false}' },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "what is TypeScript?",
      "test-model",
    );

    expect(result).toBe(false);
    expect(spawnedTasks).toHaveLength(0);
  });

  it("should spawn correct number of sub-agents for multi-endpoint task", async () => {
    const session = createSession();

    mockChatResponse = [
      {
        type: "text",
        text: JSON.stringify({
          complex: true,
          subtasks: [
            { task: "Create GET /api/products endpoint with Express", model: null },
            { task: "Create POST /api/products endpoint with validation", model: null },
            { task: "Create PUT /api/products/:id endpoint with update logic", model: null },
          ],
        }),
      },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    await (agent as any).maybeOrchestrate(
      session.id,
      "create a REST API with GET, POST and PUT for products",
      "test-model",
    );

    expect(spawnedTasks).toHaveLength(3);
    expect(spawnedTasks[0].task).toContain("GET");
    expect(spawnedTasks[1].task).toContain("POST");
    expect(spawnedTasks[2].task).toContain("PUT");
  });

  it("should return false when LLM returns malformed JSON", async () => {
    const session = createSession();

    mockChatResponse = [
      { type: "text", text: "I think this is a complex task but let me explain..." },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "refactor the entire codebase",
      "test-model",
    );

    expect(result).toBe(false);
    expect(spawnedTasks).toHaveLength(0);
  });

  it("should return false when LLM returns an error chunk", async () => {
    const session = createSession();

    mockChatResponse = [{ type: "error", error: "model not available" }];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "create 5 microservices",
      "test-model",
    );

    expect(result).toBe(false);
    expect(spawnedTasks).toHaveLength(0);
  });

  it("should strip markdown code fences from LLM response", async () => {
    const session = createSession();

    const json = JSON.stringify({
      complex: true,
      subtasks: [
        { task: "Setup database schema", model: null },
        { task: "Create API routes", model: null },
      ],
    });

    mockChatResponse = [
      { type: "text", text: "```json\n" + json + "\n```" },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "create a full-stack app with database and API",
      "test-model",
    );

    expect(result).toBe(true);
    expect(spawnedTasks).toHaveLength(2);
  });

  it("should return false when complex is true but subtasks array is empty", async () => {
    const session = createSession();

    mockChatResponse = [
      { type: "text", text: '{"complex": true, "subtasks": []}' },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "do something",
      "test-model",
    );

    expect(result).toBe(false);
    expect(spawnedTasks).toHaveLength(0);
  });

  it("should return false when complex is true but subtasks is missing", async () => {
    const session = createSession();

    mockChatResponse = [
      { type: "text", text: '{"complex": true}' },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "do something complex",
      "test-model",
    );

    expect(result).toBe(false);
  });

  it("should send user message to LLM with correct system prompt", async () => {
    const session = createSession();

    mockChatResponse = [
      { type: "text", text: '{"complex": false}' },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    await (agent as any).maybeOrchestrate(
      session.id,
      "build a chat application",
      "test-model",
    );

    expect(capturedChatCalls).toHaveLength(1);
    expect(capturedChatCalls[0].model).toBe("test-model");

    const messages = capturedChatCalls[0].messages as Array<{
      role: string;
      content: string;
    }>;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("task complexity analyzer");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toBe("build a chat application");
  });
});

describe("ACP Model Resolution", () => {
  beforeEach(() => {
    testDb = initTestDb();
    mockChatResponse = [];
    capturedChatCalls = [];
    spawnedTasks = [];
    mockTaskResults = new Map();
    taskIdCounter = 0;
    mockManager = createMockManager();
  });

  afterEach(() => {
    if (testDb) testDb.close();
  });

  it("should resolve partial model names to full IDs from available models", async () => {
    const session = createSession();
    mockAvailableModels = ["qwen3:8b", "qwen3.5:397b-cloud", "llama3:70b"];

    mockChatResponse = [
      {
        type: "text",
        text: JSON.stringify({
          complex: true,
          subtasks: [
            { task: "Simple file task", model: "qwen3:8b" },
            { task: "Complex coding task", model: "qwen3.5:397b-cloud" },
          ],
        }),
      },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    await (agent as any).maybeOrchestrate(session.id, "multi-model task", "test-model");

    expect(spawnedTasks).toHaveLength(2);
    expect(spawnedTasks[0].model).toBe("qwen3:8b");
    expect(spawnedTasks[1].model).toBe("qwen3.5:397b-cloud");
  });

  it("should fall back to null model when partial name has no match", async () => {
    const session = createSession();
    mockAvailableModels = ["qwen3:8b"];

    mockChatResponse = [
      {
        type: "text",
        text: JSON.stringify({
          complex: true,
          subtasks: [
            { task: "Task with unknown model", model: "gpt-4o" },
            { task: "Other task with unknown model", model: "gemini-flash" },
          ],
        }),
      },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    await (agent as any).maybeOrchestrate(session.id, "some task", "test-model");

    expect(spawnedTasks).toHaveLength(2);
    // Model should be undefined (null fallback → no model override)
    expect(spawnedTasks[0].model).toBeUndefined();
    expect(spawnedTasks[1].model).toBeUndefined();
  });

  it("should use null model when subtask model is 'null' string", async () => {
    const session = createSession();
    mockAvailableModels = [];

    mockChatResponse = [
      {
        type: "text",
        text: JSON.stringify({
          complex: true,
          subtasks: [
            { task: "Default model task A", model: "null" },
            { task: "Default model task B", model: "null" },
          ],
        }),
      },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    await (agent as any).maybeOrchestrate(session.id, "default model task", "test-model");

    expect(spawnedTasks).toHaveLength(2);
    expect(spawnedTasks[0].model).toBeUndefined();
    expect(spawnedTasks[1].model).toBeUndefined();
  });
});

describe("ACP Orchestration Events and DB Persistence", () => {
  beforeEach(() => {
    testDb = initTestDb();
    mockChatResponse = [];
    capturedChatCalls = [];
    spawnedTasks = [];
    mockTaskResults = new Map();
    taskIdCounter = 0;
    mockManager = createMockManager();
    mockAvailableModels = [];
  });

  afterEach(() => {
    if (testDb) testDb.close();
  });

  it("should persist orchestration run to database", async () => {
    const session = createSession();

    mockChatResponse = [
      {
        type: "text",
        text: JSON.stringify({
          complex: true,
          subtasks: [
            { task: "Subtask A", model: null },
            { task: "Subtask B", model: null },
          ],
        }),
      },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    await (agent as any).maybeOrchestrate(session.id, "complex task", "test-model");

    // Verify orchestration run was saved in DB
    const runs = testDb
      .prepare("SELECT * FROM orchestration_runs WHERE parent_session_id = ?")
      .all(session.id) as Array<{ subtask_count: number; status: string }>;

    expect(runs).toHaveLength(1);
    expect(runs[0].subtask_count).toBe(2);
  });

  it("should emit chunk events during orchestration", async () => {
    const session = createSession();

    mockChatResponse = [
      {
        type: "text",
        text: JSON.stringify({
          complex: true,
          subtasks: [
            { task: "Create user service", model: null },
            { task: "Create auth service", model: null },
          ],
        }),
      },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const chunks: string[] = [];
    agent.on("chunk", (text) => chunks.push(text));

    await (agent as any).maybeOrchestrate(
      session.id,
      "create user and auth microservices",
      "test-model",
    );

    // Should have emitted orchestration announcement
    const announcement = chunks.find((c) => c.includes("Tarefa complexa detectada"));
    expect(announcement).toBeDefined();

    // Should mention the number of sub-agents
    expect(announcement).toContain("2");
  });

  it("should call prewarm before spawning sub-agents", async () => {
    const session = createSession();

    mockChatResponse = [
      {
        type: "text",
        text: JSON.stringify({
          complex: true,
          subtasks: [
            { task: "Task 1", model: null },
            { task: "Task 2", model: null },
            { task: "Task 3", model: null },
          ],
        }),
      },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    await (agent as any).maybeOrchestrate(session.id, "three tasks", "test-model");

    expect(mockManager.prewarm).toHaveBeenCalledWith(3);
    expect(mockManager.spawnMany).toHaveBeenCalledTimes(1);
  });
});

describe("ACP Edge Cases", () => {
  beforeEach(() => {
    testDb = initTestDb();
    mockChatResponse = [];
    capturedChatCalls = [];
    spawnedTasks = [];
    mockTaskResults = new Map();
    taskIdCounter = 0;
    mockManager = createMockManager();
    mockAvailableModels = [];
  });

  afterEach(() => {
    if (testDb) testDb.close();
  });

  it("should NOT orchestrate with a single subtask (Fase 2.2: falls back to parent loop)", async () => {
    const session = createSession();

    mockChatResponse = [
      {
        type: "text",
        text: JSON.stringify({
          complex: true,
          subtasks: [{ task: "Only one subtask", model: null }],
        }),
      },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "single complex operation",
      "test-model",
    );

    // Fase 2.2: with a single subtask we short-circuit to keep execution
    // in the parent loop (avoids the subagent spawn overhead).
    expect(result).toBe(false);
    expect(spawnedTasks).toHaveLength(0);
  });

  it("should handle LLM response with extra whitespace", async () => {
    const session = createSession();

    mockChatResponse = [
      { type: "text", text: "\n\n  " },
      {
        type: "text",
        text: '{"complex": true, "subtasks": [{"task": "Clean task A", "model": null}, {"task": "Clean task B", "model": null}]}',
      },
      { type: "text", text: "   \n" },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "whitespace edge case",
      "test-model",
    );

    expect(result).toBe(true);
    expect(spawnedTasks).toHaveLength(2);
  });

  it("should not orchestrate for greeting messages", async () => {
    const session = createSession();

    mockChatResponse = [
      { type: "text", text: '{"complex": false}' },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "hello, how are you?",
      "test-model",
    );

    expect(result).toBe(false);
    expect(spawnedTasks).toHaveLength(0);
  });

  it("should not orchestrate for simple questions", async () => {
    const session = createSession();

    mockChatResponse = [
      { type: "text", text: '{"complex": false}' },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "what is the difference between let and const?",
      "test-model",
    );

    expect(result).toBe(false);
    expect(spawnedTasks).toHaveLength(0);
  });

  it("should handle many subtasks (batch operation)", async () => {
    const session = createSession();

    const subtasks = Array.from({ length: 8 }, (_, i) => ({
      task: `Migrate file ${i + 1} from CommonJS to ESM`,
      model: null,
    }));

    mockChatResponse = [
      {
        type: "text",
        text: JSON.stringify({ complex: true, subtasks }),
      },
      { type: "done" },
    ];

    const agent = new AgentLoop();
    const result = await (agent as any).maybeOrchestrate(
      session.id,
      "migrate all 8 files from CommonJS to ESM modules",
      "test-model",
    );

    expect(result).toBe(true);
    expect(spawnedTasks).toHaveLength(8);
    expect(mockManager.prewarm).toHaveBeenCalledWith(8);
  });
});
