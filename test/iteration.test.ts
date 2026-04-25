import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatChunk, ToolCall } from '../src/providers/types.js';
import type { ModelPlan } from '../src/agent/model-selection.js';
import type { IterationDeps, IterationEventSink, IterationState } from '../src/agent/iteration.js';
import type { ContextHealth } from '../src/context/health.js';

let chatScript: ChatChunk[] = [];

vi.mock('../src/providers/registry.js', () => {
  const mockProvider = {
    name: 'mock',
    async *chat() {
      for (const c of chatScript) yield c;
    },
  };
  return {
    getProvider: () => mockProvider,
    getActiveProvider: () => mockProvider,
  };
});

vi.mock('../src/agent/context.js', () => ({
  buildContext: vi.fn(async () => ({
    messages: [],
    budget: { total: 8000, system: 0, reserved: 0, available: 8000 },
    health: { level: 'ok', usedTokens: 0, totalTokens: 8000, pctUsed: 0 } as ContextHealth,
  })),
}));

vi.mock('../src/session/manager.js', () => ({
  addMessage: vi.fn(),
  addSessionTokens: vi.fn(),
}));

vi.mock('../src/context/health.js', () => ({
  shouldEmergencyCompact: vi.fn(() => false),
  getEmergencyKeepCount: vi.fn(() => 4),
}));

vi.mock('../src/agent/compactor.js', () => ({
  performEmergencyCompaction: vi.fn(async () => undefined),
}));

vi.mock('../src/agent/security-gate.js', () => ({
  evaluateToolCall: vi.fn(async () => ({ kind: 'allowed' })),
}));

vi.mock('../src/agent/tool-executor.js', () => ({
  runToolCall: vi.fn(async ({ toolName }) => ({
    toolName,
    success: true,
    resultText: `ok:${toolName}`,
    durationMs: 1,
    deterministicRetryApplied: false,
  })),
}));

vi.mock('../src/observability/logger.js', () => ({
  log: {
    retry: vi.fn(),
    toolCall: vi.fn(),
    loopEnd: vi.fn(),
    plannerDecision: vi.fn(),
  },
}));

import { runOneIteration } from '../src/agent/iteration.js';
import { evaluateToolCall } from '../src/agent/security-gate.js';
import { runToolCall } from '../src/agent/tool-executor.js';
import { shouldEmergencyCompact } from '../src/context/health.js';
import { performEmergencyCompaction } from '../src/agent/compactor.js';

const cloudPlan: ModelPlan = {
  loopModel: 'claude-sonnet',
  auxModel: 'claude-sonnet',
  hasToolModel: false,
  localHasTools: true,
};

const fallbackPlan: ModelPlan = {
  loopModel: 'qwen2.5-coder',
  auxModel: 'llama3',
  hasToolModel: true,
  localHasTools: false,
};

function makeSink(): IterationEventSink & { events: Array<[string, unknown?]> } {
  const events: Array<[string, unknown?]> = [];
  return {
    events,
    thinking: () => events.push(['thinking']),
    chunk: (t) => events.push(['chunk', t]),
    toolCall: (tc) => events.push(['tool_call', tc]),
    toolResult: (n, t, s) => events.push(['tool_result', { n, t, s }]),
    compacting: () => events.push(['compacting']),
    contextHealth: (h) => events.push(['context_health', h]),
    usage: (u) => events.push(['usage', u]),
    clearStreaming: () => events.push(['clear_streaming']),
    modelSwitch: (m) => events.push(['model_switch', m]),
  };
}

function makeDeps(override: Partial<IterationDeps> = {}): IterationDeps & { sink: ReturnType<typeof makeSink> } {
  const sink = makeSink();
  const deps: IterationDeps = {
    sessionId: 's1',
    plan: cloudPlan,
    toolSchemas: [],
    allowRules: [],
    planMode: false,
    temperament: 'neutral',
    maxIterations: 5,
    signal: undefined,
    approvedAllRef: { current: false },
    requestApproval: vi.fn(async () => 'approve'),
    emit: sink,
    ...override,
  };
  return Object.assign(deps, { sink });
}

const initial: IterationState = { iteration: 0, switchedToCloud: false, lastHadToolCalls: false, retryCount: 0 };

beforeEach(() => {
  chatScript = [];
  vi.mocked(evaluateToolCall).mockReset().mockResolvedValue({ kind: 'allowed' });
  vi.mocked(runToolCall).mockReset().mockImplementation(async ({ toolName }) => ({
    toolName,
    success: true,
    resultText: `ok:${toolName}`,
    durationMs: 1,
    deterministicRetryApplied: false,
  }));
  vi.mocked(shouldEmergencyCompact).mockReset().mockReturnValue(false);
  vi.mocked(performEmergencyCompaction).mockReset();
});

describe('runOneIteration / aborted', () => {
  it('returns aborted immediately when signal is already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const deps = makeDeps({ signal: ctrl.signal });

    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('aborted');
    expect(deps.sink.events).toHaveLength(0);
  });

  it('returns aborted mid-iteration when aborted between tool calls', async () => {
    const tc: ToolCall = { id: 't1', function: { name: 'read', arguments: {} } };
    chatScript = [{ type: 'tool_call', toolCall: tc }, { type: 'done' }];

    const ctrl = new AbortController();
    const deps = makeDeps({ signal: ctrl.signal });
    vi.mocked(evaluateToolCall).mockImplementation(async () => {
      ctrl.abort();
      return { kind: 'allowed' };
    });
    // The abort check runs before the gate, so we abort AFTER first gate call. To trigger
    // the pre-gate abort, abort before runOneIteration sees the for-loop. Instead, pre-abort
    // and supply two tool calls — first call runs, second hits the check.
    const tc2: ToolCall = { id: 't2', function: { name: 'read', arguments: {} } };
    chatScript = [
      { type: 'tool_call', toolCall: tc },
      { type: 'tool_call', toolCall: tc2 },
      { type: 'done' },
    ];

    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('aborted');
  });
});

describe('runOneIteration / done', () => {
  it('returns done when stream yields text without tool calls', async () => {
    chatScript = [
      { type: 'text', text: 'hello ' },
      { type: 'text', text: 'world' },
      { type: 'done', usage: { promptTokens: 10, completionTokens: 5 } },
    ];
    const deps = makeDeps();

    const outcome = await runOneIteration(deps, initial);

    expect(outcome).toEqual({ kind: 'done', fullText: 'hello world' });
    expect(deps.sink.events.find(e => e[0] === 'usage')).toBeDefined();
  });
});

describe('runOneIteration / error', () => {
  it('returns error when stream fails and retry budget is exhausted', async () => {
    chatScript = [{ type: 'error', error: 'timeout' }];
    const deps = makeDeps();

    const outcome = await runOneIteration(deps, initial);

    expect(outcome).toEqual({ kind: 'error', message: 'timeout' });
  });

  it('retries stream error once when previous iteration had tool calls', async () => {
    chatScript = [{ type: 'error', error: 'timeout' }];
    const deps = makeDeps();

    const outcome = await runOneIteration(deps, { ...initial, lastHadToolCalls: true });

    expect(outcome.kind).toBe('continue');
    if (outcome.kind === 'continue') expect(outcome.state.retryCount).toBe(1);
  });
});

describe('runOneIteration / continue after tool calls', () => {
  it('runs each tool call, emits tool_result, and continues with lastHadToolCalls=true', async () => {
    const tc: ToolCall = { id: 't1', function: { name: 'read', arguments: {} } };
    chatScript = [{ type: 'tool_call', toolCall: tc }, { type: 'done' }];

    const deps = makeDeps();

    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('continue');
    if (outcome.kind === 'continue') {
      expect(outcome.state.lastHadToolCalls).toBe(true);
      expect(outcome.state.iteration).toBe(1);
      expect(outcome.state.retryCount).toBe(0);
    }
    expect(deps.sink.events.some(e => e[0] === 'tool_result')).toBe(true);
  });

  it('skips executor when gate blocks the call', async () => {
    const tc: ToolCall = { id: 't1', function: { name: 'exec', arguments: { command: 'rm -rf /' } } };
    chatScript = [{ type: 'tool_call', toolCall: tc }, { type: 'done' }];
    vi.mocked(evaluateToolCall).mockResolvedValue({ kind: 'blocked', reason: 'blocked cmd' });

    const deps = makeDeps();
    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('continue');
    expect(runToolCall).not.toHaveBeenCalled();
    expect(deps.sink.events.find(e => e[0] === 'tool_result')).toBeDefined();
  });
});

describe('runOneIteration / switch to cloud on refusal', () => {
  it('switches to cloud when local model refuses without tools (useLocalFirst)', async () => {
    chatScript = [
      { type: 'text', text: "I can't execute commands here." },
      { type: 'done' },
    ];
    const deps = makeDeps({ plan: fallbackPlan });

    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('continue');
    if (outcome.kind === 'continue') {
      expect(outcome.state.switchedToCloud).toBe(true);
    }
    expect(deps.sink.events.some(e => e[0] === 'model_switch' && e[1] === 'qwen2.5-coder')).toBe(true);
    expect(deps.sink.events.some(e => e[0] === 'clear_streaming')).toBe(true);
  });
});

describe('runOneIteration / emergency compaction', () => {
  it('rebuilds context after shouldEmergencyCompact', async () => {
    vi.mocked(shouldEmergencyCompact).mockReturnValueOnce(true);
    chatScript = [{ type: 'text', text: 'done' }, { type: 'done' }];

    const deps = makeDeps();
    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('done');
    expect(performEmergencyCompaction).toHaveBeenCalled();
    expect(deps.sink.events.filter(e => e[0] === 'context_health')).toHaveLength(2);
    expect(deps.sink.events.some(e => e[0] === 'compacting')).toBe(true);
  });
});
