import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addMessage: vi.fn(),
  loopEnd: vi.fn(),
  maybeGenerateTitle: vi.fn(),
  retry: vi.fn(),
  runHook: vi.fn(),
  runOneIteration: vi.fn(),
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
  maybeAutoOrchestrate: vi.fn(async () => false),
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
    expect(mocks.addMessage).toHaveBeenCalledWith(
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
});
