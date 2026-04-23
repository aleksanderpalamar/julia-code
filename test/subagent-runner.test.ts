import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";

type TaskStatus = "queued" | "running" | "completed" | "failed";

interface FakeTaskState {
  id: string;
  status: TaskStatus;
  result?: string;
  error?: string;
  durationMs?: number;
}

class FakeManager extends EventEmitter {
  private tasks = new Map<string, FakeTaskState>();
  private counter = 0;
  public prewarmCalls: number[] = [];
  public spawnCalls: Array<{ parentSessionId: string; descriptors: unknown[]; runId: string }> = [];

  prewarm(count: number): void {
    this.prewarmCalls.push(count);
  }

  getTask(taskId: string): FakeTaskState | undefined {
    return this.tasks.get(taskId);
  }

  async spawnMany(
    parentSessionId: string,
    descriptors: Array<{ task: string; model?: string; sharedContext?: string }>,
    runId: string,
  ): Promise<string[]> {
    this.spawnCalls.push({ parentSessionId, descriptors, runId });
    const ids: string[] = [];
    for (const _ of descriptors) {
      const id = `t-${++this.counter}`;
      ids.push(id);
      this.tasks.set(id, { id, status: "queued" });
    }
    return ids;
  }

  transition(taskId: string, status: TaskStatus, patch: Partial<FakeTaskState> = {}): void {
    const current = this.tasks.get(taskId);
    if (!current) throw new Error(`unknown task ${taskId}`);
    const next = { ...current, status, ...patch };
    this.tasks.set(taskId, next);
    if (status === "running") this.emit("task:started", taskId);
    if (status === "completed") this.emit("task:completed", taskId, patch.result ?? "");
    if (status === "failed") this.emit("task:failed", taskId, patch.error ?? "err");
  }

  presetTask(taskId: string, state: FakeTaskState): void {
    this.tasks.set(taskId, state);
  }

  listenerCountsAllZero(): boolean {
    for (const event of ["task:chunk", "task:started", "task:completed", "task:failed"]) {
      if (this.listenerCount(event) !== 0) return false;
    }
    return true;
  }
}

let fakeManager: FakeManager;

vi.mock("../src/agent/subagent.js", () => ({
  getSubagentManager: () => fakeManager,
}));

import { executeSubagents } from "../src/agent/orchestrator/subagent-runner.js";
import type { OrchestrationEventSink, PlannedSubtask } from "../src/agent/orchestrator/types.js";

interface Capture {
  chunks: string[];
  subagentChunks: Array<{ taskId: string; label: string; text: string }>;
  statuses: Array<{ taskId: string; status: string; durationMs?: number }>;
  progress: Array<{ completed: number; failed: number; running: number; queued: number }>;
}

function makeEmit(): { emit: Pick<OrchestrationEventSink, "chunk" | "subagentChunk" | "subagentStatus" | "progress">; capture: Capture } {
  const capture: Capture = { chunks: [], subagentChunks: [], statuses: [], progress: [] };
  const emit = {
    chunk: (text: string) => capture.chunks.push(text),
    subagentChunk: (taskId: string, label: string, text: string) =>
      capture.subagentChunks.push({ taskId, label, text }),
    subagentStatus: (taskId: string, _label: string, status: string, durationMs?: number) =>
      capture.statuses.push({ taskId, status, durationMs }),
    progress: (p: { completed: number; failed: number; running: number; queued: number }) =>
      capture.progress.push({ completed: p.completed, failed: p.failed, running: p.running, queued: p.queued }),
  };
  return { emit, capture };
}

const twoSubtasks: PlannedSubtask[] = [
  { task: "first subtask does A" },
  { task: "second subtask does B", model: "gpt-oss:20b" },
];

describe("executeSubagents", () => {
  beforeEach(() => {
    fakeManager = new FakeManager();
  });

  it("prewarms, forwards chunks with labels, transitions statuses, and returns counts", async () => {
    const { emit, capture } = makeEmit();

    const resultPromise = executeSubagents({
      sessionId: "s1",
      runId: "run-1",
      subtasks: twoSubtasks,
      sharedContext: undefined,
      emit,
    });

    await new Promise(r => setImmediate(r));

    const [id1, id2] = ["t-1", "t-2"];
    fakeManager.emit("task:chunk", id1, "hello");
    fakeManager.transition(id1, "running");
    fakeManager.transition(id2, "running");
    fakeManager.transition(id1, "completed", { result: "ok A", durationMs: 10 });
    fakeManager.transition(id2, "completed", { result: "ok B", durationMs: 20 });

    const result = await resultPromise;

    expect(fakeManager.prewarmCalls).toEqual([2]);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.allDone).toBe(true);
    expect(result.resultLines[0]).toContain("ok A");
    expect(result.resultLines[1]).toContain("ok B");
    expect(capture.subagentChunks).toEqual([
      { taskId: id1, label: "first subtask does A", text: "hello" },
    ]);
    expect(capture.statuses.find(s => s.taskId === id1 && s.status === "completed")?.durationMs).toBe(10);
    expect(capture.progress.length).toBeGreaterThan(0);
    expect(fakeManager.listenerCountsAllZero()).toBe(true);
  });

  it("counts failures separately and sets allDone=false", async () => {
    const { emit } = makeEmit();

    const resultPromise = executeSubagents({
      sessionId: "s1",
      runId: "run-1",
      subtasks: twoSubtasks,
      sharedContext: undefined,
      emit,
    });

    await new Promise(r => setImmediate(r));

    fakeManager.transition("t-1", "completed", { result: "ok A", durationMs: 10 });
    fakeManager.transition("t-2", "failed", { error: "boom", durationMs: 5 });

    const result = await resultPromise;
    expect(result.completed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.allDone).toBe(false);
    expect(result.resultLines[1]).toContain("❌ Failed: boom");
  });

  it("recovers tasks that already finished before spawnMany returned", async () => {
    const { emit } = makeEmit();

    const originalSpawn = FakeManager.prototype.spawnMany;
    fakeManager.spawnMany = async function (parent, descriptors, runId) {
      const ids = await originalSpawn.call(this, parent, descriptors, runId);
      for (const id of ids) {
        this.presetTask(id, { id, status: "completed", result: `eager ${id}`, durationMs: 1 });
      }
      return ids;
    };

    const result = await executeSubagents({
      sessionId: "s1",
      runId: "run-1",
      subtasks: twoSubtasks,
      sharedContext: undefined,
      emit,
    });

    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.resultLines[0]).toContain("eager t-1");
  });

  it("emits a subagent listing chunk for each spawned subtask with model suffix when present", async () => {
    const { emit, capture } = makeEmit();

    const resultPromise = executeSubagents({
      sessionId: "s1",
      runId: "run-1",
      subtasks: twoSubtasks,
      sharedContext: undefined,
      emit,
    });

    await new Promise(r => setImmediate(r));
    fakeManager.transition("t-1", "completed", { result: "ok" });
    fakeManager.transition("t-2", "completed", { result: "ok" });
    await resultPromise;

    const listings = capture.chunks.filter(c => c.startsWith("🤖"));
    expect(listings).toHaveLength(2);
    expect(listings[1]).toContain("[gpt-oss:20b]");
    expect(listings[0]).not.toContain("[");
  });

  it("ignores events for task ids it did not spawn", async () => {
    const { emit, capture } = makeEmit();

    const resultPromise = executeSubagents({
      sessionId: "s1",
      runId: "run-1",
      subtasks: twoSubtasks,
      sharedContext: undefined,
      emit,
    });

    await new Promise(r => setImmediate(r));

    fakeManager.emit("task:chunk", "foreign-task", "ghost text");
    fakeManager.emit("task:started", "foreign-task");

    fakeManager.transition("t-1", "completed", { result: "ok" });
    fakeManager.transition("t-2", "completed", { result: "ok" });
    await resultPromise;

    expect(capture.subagentChunks.find(c => c.taskId === "foreign-task")).toBeUndefined();
    expect(capture.statuses.find(s => s.taskId === "foreign-task")).toBeUndefined();
  });

  it("forwards sharedContext into every descriptor", async () => {
    const { emit } = makeEmit();

    const resultPromise = executeSubagents({
      sessionId: "s1",
      runId: "run-1",
      subtasks: twoSubtasks,
      sharedContext: "<snapshot>",
      emit,
    });

    await new Promise(r => setImmediate(r));
    fakeManager.transition("t-1", "completed", { result: "ok" });
    fakeManager.transition("t-2", "completed", { result: "ok" });
    await resultPromise;

    expect(fakeManager.spawnCalls).toHaveLength(1);
    const { descriptors } = fakeManager.spawnCalls[0];
    expect(descriptors).toHaveLength(2);
    for (const d of descriptors as Array<{ sharedContext?: string }>) {
      expect(d.sharedContext).toBe("<snapshot>");
    }
  });

  it("removes all listeners after resolution", async () => {
    const { emit } = makeEmit();

    const resultPromise = executeSubagents({
      sessionId: "s1",
      runId: "run-1",
      subtasks: twoSubtasks,
      sharedContext: undefined,
      emit,
    });

    await new Promise(r => setImmediate(r));
    fakeManager.transition("t-1", "completed", { result: "ok" });
    fakeManager.transition("t-2", "completed", { result: "ok" });
    await resultPromise;

    expect(fakeManager.listenerCountsAllZero()).toBe(true);
  });
});
