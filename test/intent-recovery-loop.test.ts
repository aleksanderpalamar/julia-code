import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addMessage: vi.fn(),
  loopEnd: vi.fn(),
  maybeGenerateTitle: vi.fn(),
  retry: vi.fn(),
  runHook: vi.fn(),
  runOneIteration: vi.fn(),
  maybeAutoOrchestrate: vi.fn(),
}));

vi.mock('../src/tools/registry.js', () => ({
  getToolSchemas: () => [],
}));

vi.mock('../src/session/manager.js', () => ({
  addMessage: mocks.addMessage,
  getMessageCount: () => 0,
}));

vi.mock('../src/config/index.js', () => ({
  getConfig: () => ({
    defaultModel: 'test-model',
    maxToolIterations: 5,
    routeTools: null,
    toolModel: null,
  }),
}));

vi.mock('../src/tools/memory.js', () => ({ setCurrentSessionId: vi.fn() }));
vi.mock('../src/tools/subagent.js', () => ({ setSubagentSessionId: vi.fn() }));

vi.mock('../src/observability/logger.js', () => ({
  log: {
    loopEnd: mocks.loopEnd,
    retry: mocks.retry,
  },
}));

vi.mock('../src/agent/title-generator.js', () => ({
  maybeGenerateTitle: mocks.maybeGenerateTitle,
}));

vi.mock('../src/agent/model-selection.js', () => ({
  resolveModelPlan: vi.fn(async () => ({
    loopModel: 'test-model',
    auxModel: 'test-model',
    hasToolModel: false,
    localHasTools: true,
    routeTools: null,
  })),
}));

vi.mock('../src/agent/iteration.js', () => ({
  runOneIteration: mocks.runOneIteration,
}));

vi.mock('../src/agent/loop/approval-gate.js', () => ({
  requestApproval: vi.fn(async () => 'approve'),
  SessionApprovalState: class {
    createIterationRef() {
      return { current: false };
    }

    syncFromRef() {}
  },
}));

vi.mock('../src/agent/loop/workflow-decisions.js', () => ({
  maybeAutoOrchestrate: mocks.maybeAutoOrchestrate,
  maybeRunCompaction: vi.fn(async () => false),
}));

vi.mock('../src/hooks/runner.js', () => ({
  runHook: mocks.runHook,
}));

vi.mock('../src/repo-intel/mention-resolver.js', () => ({
  resolveMentionsInPrompt: vi.fn(async () => ({ resolved: [], errors: [] })),
  buildMentionContextBlock: vi.fn(),
}));

import { AgentLoop } from '../src/agent/loop.js';

const stateAfterNudge = {
  iteration: 1,
  switchedToCloud: false,
  lastHadToolCalls: false,
  retryCount: 0,
  intentNudgeUsed: true,
};

describe('AgentLoop / intent recovery lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runHook.mockResolvedValue({});
    mocks.maybeGenerateTitle.mockResolvedValue('Recovered turn');
    mocks.maybeAutoOrchestrate.mockResolvedValue(false);
  });

  it('clears the tentative stream and finalizes a warning through the normal lifecycle', async () => {
    mocks.runOneIteration
      .mockResolvedValueOnce({
        kind: 'nudge-intent',
        fullText: 'Vou ler o package.json agora.',
        state: stateAfterNudge,
      })
      .mockResolvedValueOnce({
        kind: 'done-with-warning',
        fullText: 'Ainda vou ler o package.json.',
        message: 'recovery warning',
      });

    const agent = new AgentLoop();
    const events: string[] = [];
    agent.on('clear_streaming', () => events.push('clear_streaming'));
    agent.on('warning', () => events.push('warning'));
    agent.on('done', () => events.push('done'));

    await agent.run('session-1', 'inspect the project');

    expect(events).toEqual(['clear_streaming', 'warning', 'done']);
    expect(mocks.retry).toHaveBeenCalledWith({
      sessionId: 'session-1',
      iteration: 1,
      kind: 'intent-nudge',
    });
    expect(mocks.runHook).toHaveBeenCalledWith('Stop', expect.objectContaining({
      session_id: 'session-1',
      hook_event_name: 'Stop',
    }));
    expect(mocks.loopEnd).toHaveBeenCalledWith({
      sessionId: 'session-1',
      iterations: 2,
      reason: 'done',
    });
    expect(mocks.maybeGenerateTitle).toHaveBeenCalledWith(
      'session-1',
      'test-model',
      'inspect the project',
      'Ainda vou ler o package.json.',
    );
    expect(mocks.runOneIteration.mock.calls[0][0].transientSystemContent).toBeUndefined();
    expect(mocks.runOneIteration.mock.calls[1][0].transientSystemContent).toContain(
      '[intent-without-action]',
    );
    expect(mocks.runOneIteration.mock.calls[1][0].transientAssistantContent).toBe(
      'Vou ler o package.json agora.',
    );
    expect(mocks.addMessage).not.toHaveBeenCalledWith(
      'session-1',
      'system',
      expect.stringContaining('[intent-without-action]'),
    );
  });

  it('uses the SubagentStop lifecycle for warning completion in subagents', async () => {
    mocks.runOneIteration.mockResolvedValueOnce({
      kind: 'done-with-warning',
      fullText: 'Vou verificar depois.',
      message: 'recovery warning',
    });

    const agent = new AgentLoop({ isSubagent: true });
    await agent.run('subagent-session', 'inspect');

    expect(mocks.runHook).toHaveBeenCalledWith('SubagentStop', expect.objectContaining({
      hook_event_name: 'SubagentStop',
    }));
  });

  it('skips auto-orchestration when the active skill opts out of tools', async () => {
    mocks.runOneIteration.mockResolvedValueOnce({ kind: 'done', fullText: 'direct answer' });

    const agent = new AgentLoop();
    await agent.run('dialog-session', 'converse comigo', undefined, undefined, 'skill', false);

    expect(mocks.maybeAutoOrchestrate).not.toHaveBeenCalled();
    expect(mocks.runOneIteration).toHaveBeenCalledTimes(1);
  });

  it('expires the recovery nudge before a later user turn', async () => {
    mocks.runOneIteration
      .mockResolvedValueOnce({
        kind: 'nudge-intent',
        fullText: 'Vou ler o package.json agora.',
        state: stateAfterNudge,
      })
      .mockResolvedValueOnce({ kind: 'done', fullText: 'package loaded' })
      .mockResolvedValueOnce({ kind: 'done', fullText: 'later answer' });

    const agent = new AgentLoop();
    await agent.run('resumed-session', 'inspect the project');
    const resumedAgent = new AgentLoop();
    await resumedAgent.run('resumed-session', 'explain the result');

    expect(mocks.runOneIteration.mock.calls[1][0].transientSystemContent).toContain(
      '[intent-without-action]',
    );
    expect(mocks.runOneIteration.mock.calls[1][0].transientAssistantContent).toBe(
      'Vou ler o package.json agora.',
    );
    expect(mocks.runOneIteration.mock.calls[2][0].transientSystemContent).toBeUndefined();
    expect(mocks.runOneIteration.mock.calls[2][0].transientAssistantContent).toBeUndefined();
    expect(mocks.addMessage.mock.calls.filter(call => call[1] === 'system')).toHaveLength(0);
  });

  it('preserves recovery context across an internal retry and then expires it', async () => {
    mocks.runOneIteration
      .mockResolvedValueOnce({
        kind: 'nudge-intent',
        fullText: 'Vou ler o package.json agora.',
        state: stateAfterNudge,
      })
      .mockResolvedValueOnce({
        kind: 'continue',
        reason: 'internal-retry',
        state: { ...stateAfterNudge, iteration: 2, retryCount: 1 },
      })
      .mockResolvedValueOnce({ kind: 'done', fullText: 'package loaded' })
      .mockResolvedValueOnce({ kind: 'done', fullText: 'later answer' });

    const agent = new AgentLoop();
    await agent.run('retry-session', 'inspect the project');
    await new AgentLoop().run('retry-session', 'explain the result');

    for (const callIndex of [1, 2]) {
      expect(mocks.runOneIteration.mock.calls[callIndex][0].transientSystemContent).toContain(
        '[intent-without-action]',
      );
      expect(mocks.runOneIteration.mock.calls[callIndex][0].transientAssistantContent).toBe(
        'Vou ler o package.json agora.',
      );
    }
    expect(mocks.runOneIteration.mock.calls[3][0].transientSystemContent).toBeUndefined();
    expect(mocks.runOneIteration.mock.calls[3][0].transientAssistantContent).toBeUndefined();
  });

  it('expires recovery context after a tool-call continuation', async () => {
    mocks.runOneIteration
      .mockResolvedValueOnce({
        kind: 'nudge-intent',
        fullText: 'Vou ler o package.json agora.',
        state: stateAfterNudge,
      })
      .mockResolvedValueOnce({
        kind: 'continue',
        reason: 'tool-calls',
        state: { ...stateAfterNudge, iteration: 2, lastHadToolCalls: true },
      })
      .mockResolvedValueOnce({ kind: 'done', fullText: 'package loaded' });

    await new AgentLoop().run('tool-session', 'inspect the project');

    expect(mocks.runOneIteration.mock.calls[1][0].transientSystemContent).toContain(
      '[intent-without-action]',
    );
    expect(mocks.runOneIteration.mock.calls[2][0].transientSystemContent).toBeUndefined();
    expect(mocks.runOneIteration.mock.calls[2][0].transientAssistantContent).toBeUndefined();
  });
});
