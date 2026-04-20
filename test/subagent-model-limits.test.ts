import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { EventEmitter } from "node:events";

let currentConfig: {
  acpMaxConcurrent: number;
  acpModelLimits: Record<string, number>;
  acpDefaultModel: string | null;
  acpWorktreeIsolation: boolean;
  acpSubagentMaxIterations: number;
  defaultModel: string;
};

vi.mock("../src/config/index.js", () => ({
  getConfig: () => currentConfig,
  loadConfig: vi.fn(),
}));

let testDb: Database.Database;

vi.mock("../src/session/db.js", () => ({
  getDb: () => testDb,
  closeDb: () => {
    if (testDb) testDb.close();
  },
}));

vi.mock("../src/config/workspace.js", () => ({
  getProjectDir: () => "/tmp/test-project",
}));

vi.mock("../src/agent/worktree.ts", () => ({
  isGitRepo: () => false,
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  mergeWorktree: vi.fn(),
}));

vi.mock("../src/observability/logger.js", () => ({
  log: {
    subagentSpawn: vi.fn(),
    subagentDone: vi.fn(),
  },
}));

vi.mock("../src/tools/registry.js", () => ({
  toolContextStorage: {
    run: (_ctx: unknown, fn: () => void) => fn(),
  },
}));

type FakeAgent = EventEmitter & {
  run: (sessionId: string, task: string, model?: string) => Promise<void>;
  abort: () => void;
  resolveRun: () => void;
  finishDone: (text: string) => void;
  finishError: (err: string) => void;
};

const liveAgents: FakeAgent[] = [];

function makeFakeAgent(): FakeAgent {
  const ee = new EventEmitter() as FakeAgent;
  let resolveRun!: () => void;
  const runPromise = new Promise<void>((res) => {
    resolveRun = res;
  });
  ee.run = vi.fn(async () => runPromise);
  ee.abort = vi.fn(() => resolveRun());
  ee.resolveRun = resolveRun;
  ee.finishDone = (text: string) => {
    ee.emit("done", text);
    resolveRun();
  };
  ee.finishError = (err: string) => {
    ee.emit("error", err);
    resolveRun();
  };
  return ee;
}

vi.mock("../src/agent/loop.js", () => ({
  AgentLoop: class {
    private ee: FakeAgent;
    constructor() {
      this.ee = makeFakeAgent();
      liveAgents.push(this.ee);
    }
    on(event: string, fn: (...args: any[]) => void) {
      this.ee.on(event, fn);
      return this;
    }
    off(event: string, fn: (...args: any[]) => void) {
      this.ee.off(event, fn);
      return this;
    }
    run(sessionId: string, task: string, model?: string) {
      return this.ee.run(sessionId, task, model);
    }
    abort() {
      this.ee.abort();
    }
  },
}));

import { SubagentManager } from "../src/agent/subagent.js";

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
    CREATE TABLE IF NOT EXISTS orchestration_runs (
      id TEXT PRIMARY KEY,
      parent_session_id TEXT NOT NULL,
      user_task TEXT NOT NULL,
      subtask_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      duration_ms INTEGER
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
      duration_ms INTEGER
    );
  `);
  return db;
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("SubagentManager per-model concurrency (Fase 4.1)", () => {
  const parentSession = "parent-sess";
  const runId = "run-1";

  beforeEach(() => {
    testDb = initTestDb();
    testDb
      .prepare("INSERT INTO sessions (id, model) VALUES (?, ?)")
      .run(parentSession, "default-model");
    testDb
      .prepare("INSERT INTO orchestration_runs (id, parent_session_id, user_task) VALUES (?, ?, ?)")
      .run(runId, parentSession, "test");
    liveAgents.length = 0;
    currentConfig = {
      acpMaxConcurrent: 5,
      acpModelLimits: {},
      acpDefaultModel: null,
      acpWorktreeIsolation: false,
      acpSubagentMaxIterations: 10,
      defaultModel: "default-model",
    };
  });

  afterEach(() => {
    if (testDb) testDb.close();
  });

  it("admits up to acpMaxConcurrent when no per-model limit is set", async () => {
    const m = new SubagentManager();
    const ids = await Promise.all([
      m.spawn(parentSession, "a", runId, "modelX"),
      m.spawn(parentSession, "b", runId, "modelX"),
      m.spawn(parentSession, "c", runId, "modelX"),
      m.spawn(parentSession, "d", runId, "modelX"),
    ]);
    await flush();

    expect(m.getTask(ids[0])!.status).toBe("running");
    expect(m.getTask(ids[1])!.status).toBe("running");
    expect(m.getTask(ids[2])!.status).toBe("running");
    expect(m.getTask(ids[3])!.status).toBe("running");
  });

  it("queues additional tasks of a model that already hit its sub-limit", async () => {
    currentConfig.acpModelLimits = { modelX: 1 };
    const m = new SubagentManager();
    const ids = await Promise.all([
      m.spawn(parentSession, "a", runId, "modelX"),
      m.spawn(parentSession, "b", runId, "modelX"),
      m.spawn(parentSession, "c", runId, "modelX"),
    ]);
    await flush();

    expect(m.getTask(ids[0])!.status).toBe("running");
    expect(m.getTask(ids[1])!.status).toBe("queued");
    expect(m.getTask(ids[2])!.status).toBe("queued");
  });

  it("does not let one slow model block a different model", async () => {
    currentConfig.acpModelLimits = { slow: 1 };
    const m = new SubagentManager();
    const ids = await Promise.all([
      m.spawn(parentSession, "s1", runId, "slow"),
      m.spawn(parentSession, "s2", runId, "slow"),
      m.spawn(parentSession, "f1", runId, "fast"),
      m.spawn(parentSession, "f2", runId, "fast"),
    ]);
    await flush();

    expect(m.getTask(ids[0])!.status).toBe("running");
    expect(m.getTask(ids[1])!.status).toBe("queued");
    expect(m.getTask(ids[2])!.status).toBe("running");
    expect(m.getTask(ids[3])!.status).toBe("running");
  });

  it("drains the per-model queue (FIFO) when a running task completes", async () => {
    currentConfig.acpModelLimits = { modelX: 1 };
    const m = new SubagentManager();
    const ids = await Promise.all([
      m.spawn(parentSession, "first", runId, "modelX"),
      m.spawn(parentSession, "second", runId, "modelX"),
      m.spawn(parentSession, "third", runId, "modelX"),
    ]);
    await flush();

    expect(m.getTask(ids[1])!.status).toBe("queued");

    liveAgents[0].finishDone("ok");
    await flush();
    await flush();

    expect(m.getTask(ids[0])!.status).toBe("completed");
    expect(m.getTask(ids[1])!.status).toBe("running");
    expect(m.getTask(ids[2])!.status).toBe("queued");

    liveAgents[1].finishDone("ok");
    await flush();
    await flush();

    expect(m.getTask(ids[2])!.status).toBe("running");
  });

  it("respects the global cap even when per-model limits are high", async () => {
    currentConfig.acpMaxConcurrent = 2;
    currentConfig.acpModelLimits = { modelX: 10 };
    const m = new SubagentManager();
    const ids = await Promise.all([
      m.spawn(parentSession, "a", runId, "modelX"),
      m.spawn(parentSession, "b", runId, "modelX"),
      m.spawn(parentSession, "c", runId, "modelX"),
    ]);
    await flush();

    expect(m.getTask(ids[0])!.status).toBe("running");
    expect(m.getTask(ids[1])!.status).toBe("running");
    expect(m.getTask(ids[2])!.status).toBe("queued");
  });

  it("cancel releases the per-model slot so the queue can drain", async () => {
    currentConfig.acpModelLimits = { modelX: 1 };
    const m = new SubagentManager();
    const ids = await Promise.all([
      m.spawn(parentSession, "first", runId, "modelX"),
      m.spawn(parentSession, "second", runId, "modelX"),
    ]);
    await flush();

    expect(m.getTask(ids[1])!.status).toBe("queued");

    m.cancelTask(ids[0]);
    await flush();

    expect(m.getTask(ids[0])!.status).toBe("failed");
    expect(m.getTask(ids[1])!.status).toBe("running");
  });
});
