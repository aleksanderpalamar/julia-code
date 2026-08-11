import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatChunk, ChatMessage, ToolCall } from '../src/providers/types.js';
import type { ModelPlan } from '../src/agent/model-selection.js';
import type { IterationDeps, IterationEventSink, IterationState } from '../src/agent/iteration.js';
import type { ContextHealth } from '../src/context/health.js';

let chatScript: ChatChunk[] = [];
let chatMessages: ChatMessage[][] = [];
let chatError: Error | undefined;

vi.mock('../src/providers/registry.js', () => ({
  getProvider: () => ({
    name: 'mock',
    async *chat(input: { messages: ChatMessage[] }) {
      chatMessages.push(input.messages);
      for (const c of chatScript) yield c;
      if (chatError) throw chatError;
    },
  }),
}));

vi.mock('../src/agent/context.js', () => ({
  buildContext: vi.fn(async (
    _sessionId: string,
    _model: string,
    options?: { transientSystemContent?: string; transientAssistantContent?: string },
  ) => ({
    messages: [
      ...(options?.transientSystemContent
        ? [{ role: 'system' as const, content: options.transientSystemContent }]
        : []),
      ...(options?.transientAssistantContent
        ? [{ role: 'assistant' as const, content: options.transientAssistantContent }]
        : []),
    ],
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
  performEmergencyCompaction: vi.fn(async () => ({
    performed: true, messagesCompacted: 3, tokensBefore: 900, tokensAfter: 120, durationMs: 5,
  })),
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
  recordEvent: vi.fn(),
}));

const mockConfig = {
  toolCorrectionAttempts: 2,
  diagnosticsCommand: null as string | null,
  diagnosticsTimeoutMs: 60000,
};

vi.mock('../src/config/index.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getConfig: () => mockConfig };
});

vi.mock('../src/agent/diagnostics/runner.js', () => ({
  runDiagnostics: vi.fn(async () => ({ ok: true })),
}));

import { runOneIteration } from '../src/agent/iteration.js';
import { runDiagnostics } from '../src/agent/diagnostics/runner.js';
import { addMessage } from '../src/session/manager.js';
import { evaluateToolCall } from '../src/agent/security-gate.js';
import { runToolCall } from '../src/agent/tool-executor.js';
import { shouldEmergencyCompact } from '../src/context/health.js';
import { performEmergencyCompaction } from '../src/agent/compactor.js';
import { recordEvent } from '../src/observability/logger.js';

const cloudPlan: ModelPlan = {
  loopModel: 'claude-sonnet',
  auxModel: 'claude-sonnet',
  hasToolModel: false,
  localHasTools: true,
  routeTools: null,
};

const fallbackPlan: ModelPlan = {
  loopModel: 'qwen2.5-coder',
  auxModel: 'llama3',
  hasToolModel: true,
  localHasTools: false,
  routeTools: null,
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
    turnId: 'turn-1',
    plan: cloudPlan,
    toolSchemas: [],
    allowRules: [],
    planMode: false,
    temperament: 'neutral',
    maxIterations: 5,
    skillExpectsTools: true,
    signal: undefined,
    approvedAllRef: { current: false },
    requestApproval: vi.fn(async () => 'approve'),
    emit: sink,
    ...override,
  };
  return Object.assign(deps, { sink });
}

const initial: IterationState = {
  iteration: 0,
  switchedToCloud: false,
  lastHadToolCalls: false,
  retryCount: 0,
  intentNudgeUsed: false,
};

beforeEach(() => {
  chatScript = [];
  chatMessages = [];
  chatError = undefined;
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
  vi.mocked(addMessage).mockReset();
  vi.mocked(runDiagnostics).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(recordEvent).mockReset();
  mockConfig.diagnosticsCommand = null;
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
    expect(vi.mocked(addMessage)).toHaveBeenCalledWith(
      's1', 'assistant', 'hello world', undefined, undefined, undefined, 'claude-sonnet',
    );
  });

  it('adds transient recovery content only to the current model request', async () => {
    chatScript = [{ type: 'text', text: 'recovered' }, { type: 'done' }];

    await runOneIteration(
      makeDeps({
        transientSystemContent: '[intent-without-action] act now',
        transientAssistantContent: 'I will check the file.',
      }),
      initial,
    );
    await runOneIteration(makeDeps(), initial);

    expect(chatMessages[0]).toEqual([
      { role: 'system', content: '[intent-without-action] act now' },
      { role: 'assistant', content: 'I will check the file.' },
    ]);
    expect(chatMessages[1]).toEqual([]);
  });
});

describe('runOneIteration / tool-pick routing', () => {
  const routingPlan: ModelPlan = {
    loopModel: 'big',
    auxModel: 'big',
    hasToolModel: false,
    localHasTools: true,
    routeTools: 'small',
  };

  it('synthesises with the requested model when the gather model emits no tool calls', async () => {
    chatScript = [
      { type: 'text', text: 'draft answer' },
      { type: 'done' },
    ];
    const deps = makeDeps({ plan: routingPlan });

    const outcome = await runOneIteration(deps, initial);

    expect(outcome).toEqual({ kind: 'done', fullText: 'draft answer' });
    // The gather model's prose is suppressed; only the synthesis pass streams.
    expect(deps.sink.events.filter(e => e[0] === 'chunk')).toEqual([
      ['chunk', 'draft answer'],
    ]);
    // The answer is recorded once, against the requested (synthesis) model.
    expect(vi.mocked(addMessage)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addMessage).mock.calls[0]).toEqual(
      ['s1', 'assistant', 'draft answer', undefined, undefined, undefined, 'big'],
    );
  });

  it('applies intent recovery to the routed synthesis response', async () => {
    chatScript = [
      { type: 'text', text: 'Vou inspecionar os arquivos agora.' },
      { type: 'done' },
    ];
    const deps = makeDeps({ plan: routingPlan });

    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('nudge-intent');
    if (outcome.kind !== 'nudge-intent') throw new Error('unreachable');
    expect(outcome.state.intentNudgeUsed).toBe(true);
    expect(vi.mocked(addMessage)).not.toHaveBeenCalled();
  });
});

describe('runOneIteration / error', () => {
  it('records the LLM call when the provider throws while streaming', async () => {
    chatError = new Error('provider exploded');

    await expect(runOneIteration(makeDeps(), initial)).rejects.toThrow('provider exploded');

    expect(recordEvent).toHaveBeenCalledWith('llm_call', expect.objectContaining({
      turnId: 'turn-1',
      sessionId: 's1',
      iteration: 1,
      pass: 'main',
    }));
  });

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
    if (outcome.kind === 'continue') {
      expect(outcome.reason).toBe('internal-retry');
      expect(outcome.state.retryCount).toBe(1);
    }
  });

  it('marks an empty response after tool calls as an internal retry', async () => {
    chatScript = [{ type: 'done' }];

    const outcome = await runOneIteration(
      makeDeps(),
      { ...initial, lastHadToolCalls: true },
    );

    expect(outcome.kind).toBe('continue');
    if (outcome.kind === 'continue') {
      expect(outcome.reason).toBe('internal-retry');
      expect(outcome.state.retryCount).toBe(1);
    }
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
      expect(outcome.reason).toBe('tool-calls');
      expect(outcome.state.lastHadToolCalls).toBe(true);
      expect(outcome.state.iteration).toBe(1);
      expect(outcome.state.retryCount).toBe(0);
    }
    expect(deps.sink.events.some(e => e[0] === 'tool_result')).toBe(true);
  });

  it('skips executor when gate blocks the call', async () => {
    const tc: ToolCall = { id: 't1', function: { name: 'exec', arguments: { command: 'rm -rf /' } } };
    chatScript = [{ type: 'tool_call', toolCall: tc }, { type: 'done' }];
    vi.mocked(evaluateToolCall).mockResolvedValue({ kind: 'blocked', reason: 'blocked cmd', via: 'blocklist' });

    const deps = makeDeps();
    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('continue');
    expect(runToolCall).not.toHaveBeenCalled();
    expect(deps.sink.events.find(e => e[0] === 'tool_result')).toBeDefined();
  });

  it('feeds a quota refusal back to the model as a tool observation', async () => {
    const tc: ToolCall = { id: 't1', function: { name: 'exec', arguments: { command: 'ls' } } };
    chatScript = [{ type: 'tool_call', toolCall: tc }, { type: 'done' }];
    vi.mocked(evaluateToolCall).mockResolvedValue({
      kind: 'rate_limited',
      reason: 'Limite de uso da ferramenta "exec" atingido (janela de 1 minuto). Aguarde ~30s.',
      via: 'quota',
    });

    const deps = makeDeps();
    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('continue');
    expect(runToolCall).not.toHaveBeenCalled();
    expect(vi.mocked(addMessage)).toHaveBeenCalledWith(
      's1',
      'tool',
      expect.stringContaining('Limite de uso'),
      undefined,
      't1',
    );
    expect(deps.sink.events).toContainEqual([
      'tool_result',
      { n: 'exec', t: expect.stringContaining('Limite de uso'), s: false },
    ]);
  });
});

describe('runOneIteration / diagnostics', () => {
  const editCall: ToolCall = {
    id: 't1',
    function: { name: 'edit', arguments: { path: 'src/x.ts', old_string: 'a', new_string: 'b' } },
  };

  it('runs the check after an edit and feeds problems back as a system message', async () => {
    mockConfig.diagnosticsCommand = 'tsc --noEmit';
    vi.mocked(runDiagnostics).mockResolvedValue({ ok: false, report: 'src/x.ts: error TS1' });
    chatScript = [{ type: 'tool_call', toolCall: editCall }, { type: 'done' }];

    const deps = makeDeps();
    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('continue');
    expect(vi.mocked(runDiagnostics)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runDiagnostics).mock.calls[0][0]).toMatchObject({
      command: 'tsc --noEmit',
      changedFiles: ['src/x.ts'],
    });
    expect(vi.mocked(addMessage)).toHaveBeenCalledWith(
      's1', 'system', expect.stringContaining('error TS1'),
    );
  });

  it('does not run the check when no command is configured', async () => {
    chatScript = [{ type: 'tool_call', toolCall: editCall }, { type: 'done' }];

    const deps = makeDeps();
    await runOneIteration(deps, initial);

    expect(vi.mocked(runDiagnostics)).not.toHaveBeenCalled();
  });

  it('does not run the check when only non-mutating tools ran', async () => {
    mockConfig.diagnosticsCommand = 'tsc --noEmit';
    const readCall: ToolCall = { id: 't1', function: { name: 'read', arguments: { path: 'src/x.ts' } } };
    chatScript = [{ type: 'tool_call', toolCall: readCall }, { type: 'done' }];

    const deps = makeDeps();
    await runOneIteration(deps, initial);

    expect(vi.mocked(runDiagnostics)).not.toHaveBeenCalled();
  });
});

describe('runOneIteration / intent-without-action', () => {
  it('returns nudge-intent when the model announces an action but emits no tool call', async () => {
    chatScript = [
      { type: 'text', text: 'Vou ler o package.json para entender as dependências.' },
      { type: 'done' },
    ];

    const deps = makeDeps();
    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('nudge-intent');
    if (outcome.kind !== 'nudge-intent') throw new Error('unreachable');
    expect(outcome.fullText).toContain('Vou ler o package.json');
    expect(outcome.state.intentNudgeUsed).toBe(true);
    expect(vi.mocked(addMessage)).not.toHaveBeenCalled();
  });

  it('returns nudge-intent when the announcement is followed only by waiting text', async () => {
    chatScript = [
      { type: 'text', text: 'Let me check the file. One moment please.' },
      { type: 'done' },
    ];

    const outcome = await runOneIteration(makeDeps(), initial);

    expect(outcome.kind).toBe('nudge-intent');
    expect(vi.mocked(addMessage)).not.toHaveBeenCalled();
  });

  it('returns done-with-warning when intent persists after the nudge has been used', async () => {
    chatScript = [
      { type: 'text', text: 'Agora vou rodar os testes pra ver se passam.' },
      { type: 'done' },
    ];

    const deps = makeDeps();
    const stateAfterNudge: IterationState = { ...initial, intentNudgeUsed: true };
    const outcome = await runOneIteration(deps, stateAfterNudge);

    expect(outcome.kind).toBe('done-with-warning');
    if (outcome.kind !== 'done-with-warning') throw new Error('unreachable');
    expect(outcome.message).toMatch(/⚠/);
    expect(outcome.message).toMatch(/anunciou ações/);
    expect(vi.mocked(addMessage)).toHaveBeenCalledWith(
      's1', 'assistant', 'Agora vou rodar os testes pra ver se passam.',
      undefined, undefined, undefined, 'claude-sonnet',
    );
  });

  it('persists only the recovered answer after discarding the tentative draft', async () => {
    chatScript = [
      { type: 'text', text: 'Vou ler o package.json agora.' },
      { type: 'done' },
    ];

    const first = await runOneIteration(makeDeps(), initial);
    expect(first.kind).toBe('nudge-intent');
    if (first.kind !== 'nudge-intent') throw new Error('unreachable');

    chatScript = [{ type: 'text', text: 'O package usa Vitest.' }, { type: 'done' }];
    const recovered = await runOneIteration(makeDeps({
      transientSystemContent: '[intent-without-action] act now',
      transientAssistantContent: first.fullText,
    }), first.state);

    expect(recovered).toEqual({ kind: 'done', fullText: 'O package usa Vitest.' });
    expect(vi.mocked(addMessage)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addMessage)).toHaveBeenCalledWith(
      's1', 'assistant', 'O package usa Vitest.',
      undefined, undefined, undefined, 'claude-sonnet',
    );
  });

  it('persists only the terminal draft when recovery ends with a warning', async () => {
    chatScript = [
      { type: 'text', text: 'Vou ler o package.json agora.' },
      { type: 'done' },
    ];

    const first = await runOneIteration(makeDeps(), initial);
    expect(first.kind).toBe('nudge-intent');
    if (first.kind !== 'nudge-intent') throw new Error('unreachable');

    chatScript = [
      { type: 'text', text: 'Ainda vou verificar o package.json.' },
      { type: 'done' },
    ];
    const failed = await runOneIteration(makeDeps({
      transientSystemContent: '[intent-without-action] act now',
      transientAssistantContent: first.fullText,
    }), first.state);

    expect(failed.kind).toBe('done-with-warning');
    expect(vi.mocked(addMessage)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addMessage)).toHaveBeenCalledWith(
      's1', 'assistant', 'Ainda vou verificar o package.json.',
      undefined, undefined, undefined, 'claude-sonnet',
    );
  });

  it('stays silent (done) when the active skill opts out via skillExpectsTools=false', async () => {
    chatScript = [
      { type: 'text', text: 'Vou ler o repositório e te mostrar.' },
      { type: 'done' },
    ];

    const deps = makeDeps({ skillExpectsTools: false });
    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('done');
  });

  it('stays silent (done) when the assistant text has no tool-flavored intent', async () => {
    chatScript = [
      { type: 'text', text: 'Aqui está um resumo do que entendi do seu pedido.' },
      { type: 'done' },
    ];

    const deps = makeDeps();
    const outcome = await runOneIteration(deps, initial);

    expect(outcome.kind).toBe('done');
  });

  it('does not discard a substantive answer that follows an intent-like phrase', async () => {
    chatScript = [
      {
        type: 'text',
        text: 'Vou verificar as duas opções. A primeira é mais segura; recomendo usá-la.',
      },
      { type: 'done' },
    ];

    const outcome = await runOneIteration(makeDeps(), initial);

    expect(outcome.kind).toBe('done');
  });

  it('does not nudge valid shell instructions or refusal explanations', async () => {
    chatScript = [
      { type: 'text', text: 'Use este comando:\n```bash\nnpm test\n```\nNão consigo prever o resultado sem executá-lo.' },
      { type: 'done' },
    ];

    const outcome = await runOneIteration(makeDeps(), initial);

    expect(outcome.kind).toBe('done');
  });

  it('does not nudge a negated announcement', async () => {
    chatScript = [
      { type: 'text', text: 'Não vou rodar os testes porque você pediu apenas o comando.' },
      { type: 'done' },
    ];

    const outcome = await runOneIteration(makeDeps(), initial);

    expect(outcome.kind).toBe('done');
  });

  it('warns instead of nudging when the iteration budget is exhausted', async () => {
    chatScript = [
      { type: 'text', text: 'Vou ler o package.json agora.' },
      { type: 'done' },
    ];

    const outcome = await runOneIteration(makeDeps({ maxIterations: 1 }), initial);

    expect(outcome.kind).toBe('done-with-warning');
    if (outcome.kind !== 'done-with-warning') throw new Error('unreachable');
    expect(outcome.message).toMatch(/limite de iterações/);
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
      expect(outcome.reason).toBe('model-switch');
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
