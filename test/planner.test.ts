import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChatChunk } from "../src/providers/types.js";

let mockChatResponse: ChatChunk[] = [];
let capturedChatCalls: Array<{ model: string; messages: Array<{ role: string; content: string }> }> = [];

vi.mock("../src/providers/registry.js", () => ({
  getProvider: () => ({
    name: "mock-ollama",
    async *chat(params: { model: string; messages: Array<{ role: string; content: string }> }) {
      capturedChatCalls.push(params);
      for (const chunk of mockChatResponse) {
        yield chunk;
      }
    },
  }),
}));

let mockAvailableModels: string[] = [];
vi.mock("../src/providers/ollama.js", () => ({
  listOllamaModels: async () => mockAvailableModels,
}));

let heuristicComplex = true;
vi.mock("../src/agent/complexity.ts", () => ({
  analyzeComplexity: (_msg: string) => ({ complex: heuristicComplex }),
}));

const plannerDecisionMock = vi.fn();
vi.mock("../src/observability/logger.js", () => ({
  log: {
    plannerDecision: (args: unknown) => plannerDecisionMock(args),
  },
}));

import { planSubtasks } from "../src/agent/orchestrator/planner.js";
import { clearPlannerCacheForTests, setCachedPlannerResult } from "../src/agent/planner-cache.js";

describe("planSubtasks", () => {
  beforeEach(() => {
    mockChatResponse = [];
    capturedChatCalls = [];
    mockAvailableModels = [];
    heuristicComplex = true;
    plannerDecisionMock.mockReset();
    clearPlannerCacheForTests();
  });

  it("returns simple when heuristic rejects", async () => {
    heuristicComplex = false;

    const result = await planSubtasks({
      sessionId: "s1",
      userMessage: "hi",
      model: "test-model",
    });

    expect(result).toEqual({ kind: "simple" });
    expect(capturedChatCalls).toHaveLength(0);
    expect(plannerDecisionMock).toHaveBeenCalledTimes(1);
    expect(plannerDecisionMock.mock.calls[0][0]).toMatchObject({
      complex: false,
      subtaskCount: 0,
      via: "heuristic",
    });
  });

  it("returns decomposable with via=cache on cache hit, skipping LLM", async () => {
    setCachedPlannerResult("s1", "do stuff", {
      complex: true,
      subtasks: [
        { task: "task one" },
        { task: "task two" },
      ],
    });

    const result = await planSubtasks({
      sessionId: "s1",
      userMessage: "do stuff",
      model: "test-model",
    });

    expect(result.kind).toBe("decomposable");
    if (result.kind === "decomposable") {
      expect(result.via).toBe("cache");
      expect(result.subtasks).toEqual([
        { task: "task one", model: undefined },
        { task: "task two", model: undefined },
      ]);
    }
    expect(capturedChatCalls).toHaveLength(0);
  });

  it("returns simple when LLM says complex=false", async () => {
    mockChatResponse = [
      { type: "text", text: '{"complex": false}' },
      { type: "done" },
    ];

    const result = await planSubtasks({
      sessionId: "s1",
      userMessage: "long message",
      model: "test-model",
    });

    expect(result).toEqual({ kind: "simple" });
    expect(plannerDecisionMock.mock.calls[0][0]).toMatchObject({
      complex: false,
      via: "llm",
    });
  });

  it("returns simple when LLM returns a single subtask (below threshold)", async () => {
    mockChatResponse = [
      { type: "text", text: '{"complex":true,"subtasks":[{"task":"only one"}]}' },
      { type: "done" },
    ];

    const result = await planSubtasks({
      sessionId: "s1",
      userMessage: "message",
      model: "test-model",
    });

    expect(result).toEqual({ kind: "simple" });
    expect(plannerDecisionMock.mock.calls[0][0]).toMatchObject({
      complex: false,
      subtaskCount: 1,
      via: "llm",
    });
  });

  it("returns simple and logs on malformed JSON", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockChatResponse = [
      { type: "text", text: "not json at all" },
      { type: "done" },
    ];

    const result = await planSubtasks({
      sessionId: "s1",
      userMessage: "message",
      model: "test-model",
    });

    expect(result).toEqual({ kind: "simple" });
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("JSON parse failed"));
    expect(plannerDecisionMock.mock.calls[0][0]).toMatchObject({
      complex: false,
      via: "llm",
    });
    stderrSpy.mockRestore();
  });

  it("strips markdown fencing before parsing", async () => {
    mockChatResponse = [
      {
        type: "text",
        text: '```json\n{"complex":true,"subtasks":[{"task":"a"},{"task":"b"}]}\n```',
      },
      { type: "done" },
    ];

    const result = await planSubtasks({
      sessionId: "s1",
      userMessage: "message",
      model: "test-model",
    });

    expect(result.kind).toBe("decomposable");
    if (result.kind === "decomposable") {
      expect(result.subtasks).toHaveLength(2);
    }
  });

  it("resolves partial model name against available models", async () => {
    mockAvailableModels = ["gpt-oss:20b", "llama3:8b"];
    mockChatResponse = [
      {
        type: "text",
        text: '{"complex":true,"subtasks":[{"task":"a","model":"gpt-oss"},{"task":"b","model":"llama3:8b"}]}',
      },
      { type: "done" },
    ];

    const result = await planSubtasks({
      sessionId: "s1",
      userMessage: "message",
      model: "test-model",
    });

    expect(result.kind).toBe("decomposable");
    if (result.kind === "decomposable") {
      expect(result.subtasks[0].model).toBe("gpt-oss:20b");
      expect(result.subtasks[1].model).toBe("llama3:8b");
    }
  });

  it("drops unknown model names to undefined", async () => {
    mockAvailableModels = ["llama3:8b"];
    mockChatResponse = [
      {
        type: "text",
        text: '{"complex":true,"subtasks":[{"task":"a","model":"ghost-model"},{"task":"b","model":"null"}]}',
      },
      { type: "done" },
    ];

    const result = await planSubtasks({
      sessionId: "s1",
      userMessage: "message",
      model: "test-model",
    });

    expect(result.kind).toBe("decomposable");
    if (result.kind === "decomposable") {
      expect(result.subtasks[0].model).toBeUndefined();
      expect(result.subtasks[1].model).toBeUndefined();
    }
  });

  it("returns simple and logs on provider error chunk", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockChatResponse = [
      { type: "error", error: "model down" },
    ];

    const result = await planSubtasks({
      sessionId: "s1",
      userMessage: "message",
      model: "test-model",
    });

    expect(result).toEqual({ kind: "simple" });
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("provider error: model down"));
    stderrSpy.mockRestore();
  });

  it("issues a single plannerDecision log per invocation", async () => {
    mockChatResponse = [
      { type: "text", text: '{"complex":true,"subtasks":[{"task":"a"},{"task":"b"}]}' },
      { type: "done" },
    ];

    await planSubtasks({
      sessionId: "s1",
      userMessage: "multi",
      model: "test-model",
    });

    expect(plannerDecisionMock).toHaveBeenCalledTimes(1);
    expect(plannerDecisionMock.mock.calls[0][0]).toMatchObject({
      complex: true,
      subtaskCount: 2,
      via: "llm",
    });
  });
});
