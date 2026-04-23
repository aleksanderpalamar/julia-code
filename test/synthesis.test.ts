import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChatChunk } from "../src/providers/types.js";

let mockChatResponse: ChatChunk[] = [];
let chatThrows: Error | null = null;

vi.mock("../src/providers/registry.js", () => ({
  getProvider: () => ({
    name: "mock-ollama",
    async *chat() {
      if (chatThrows) throw chatThrows;
      for (const chunk of mockChatResponse) {
        yield chunk;
      }
    },
  }),
}));

const addSessionTokensMock = vi.fn();
vi.mock("../src/session/manager.js", () => ({
  addSessionTokens: (sessionId: string, tokens: number) => addSessionTokensMock(sessionId, tokens),
}));

import { synthesizeFailureReport } from "../src/agent/orchestrator/synthesis.js";

interface CapturedChunks {
  chunks: string[];
  usages: Array<{ promptTokens: number; completionTokens: number }>;
}

function makeDeps(overrides: Partial<Parameters<typeof synthesizeFailureReport>[0]> = {}) {
  const capture: CapturedChunks = { chunks: [], usages: [] };
  const deps = {
    sessionId: "s1",
    userMessage: "original user task",
    model: "test-model",
    resultLines: [
      "### Subtask 1: foo\nok",
      "### Subtask 2: bar\n❌ Failed: boom",
    ],
    emit: {
      chunk: (text: string) => capture.chunks.push(text),
      usage: (u: { promptTokens: number; completionTokens: number }) => capture.usages.push(u),
    },
    ...overrides,
  };
  return { deps, capture };
}

describe("synthesizeFailureReport", () => {
  beforeEach(() => {
    mockChatResponse = [];
    chatThrows = null;
    addSessionTokensMock.mockReset();
  });

  it("streams text chunks, accumulates usage, and returns joined text", async () => {
    mockChatResponse = [
      { type: "text", text: "Subtask 1 " },
      { type: "text", text: "succeeded, 2 failed." },
      { type: "done", usage: { promptTokens: 10, completionTokens: 20 } },
    ];

    const { deps, capture } = makeDeps();
    const result = await synthesizeFailureReport(deps);

    expect(result).toBe("Subtask 1 succeeded, 2 failed.");
    expect(capture.chunks).toEqual(["Subtask 1 ", "succeeded, 2 failed."]);
    expect(capture.usages).toHaveLength(1);
    expect(capture.usages[0]).toEqual({ promptTokens: 10, completionTokens: 20 });
    expect(addSessionTokensMock).toHaveBeenCalledWith("s1", 30);
  });

  it("returns empty string and stops on provider error chunk without throwing", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockChatResponse = [
      { type: "text", text: "partial " },
      { type: "error", error: "model unavailable" },
      { type: "text", text: "should-not-appear" },
    ];

    const { deps, capture } = makeDeps();
    const result = await synthesizeFailureReport(deps);

    expect(result).toBe("partial ");
    expect(capture.chunks).toEqual(["partial "]);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("synthesis provider error: model unavailable"));
    stderrSpy.mockRestore();
  });

  it("logs and returns empty string when provider throws", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    chatThrows = new Error("connection refused");

    const { deps } = makeDeps();
    const result = await synthesizeFailureReport(deps);

    expect(result).toBe("");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("synthesis threw: connection refused"));
    stderrSpy.mockRestore();
  });

  it("ignores usage when done chunk has no usage field", async () => {
    mockChatResponse = [
      { type: "text", text: "hi" },
      { type: "done" },
    ];

    const { deps, capture } = makeDeps();
    await synthesizeFailureReport(deps);

    expect(capture.usages).toHaveLength(0);
    expect(addSessionTokensMock).not.toHaveBeenCalled();
  });
});
