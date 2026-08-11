import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubagentEvents, SubagentTask } from '../src/agent/subagent/types.js';

const mocks = vi.hoisted(() => ({
  agent: undefined as EventEmitter | undefined,
  updateStatus: vi.fn(),
  recordEvent: vi.fn(),
  finalizeWorktree: vi.fn(),
  teardownWorktree: vi.fn(),
}));

vi.mock('../src/agent/loop.js', async () => {
  const { EventEmitter: NodeEventEmitter } = await import('node:events');
  return {
    AgentLoop: class extends NodeEventEmitter {
      constructor() {
        super();
        mocks.agent = this;
      }

      async run(): Promise<void> {}
    },
  };
});

vi.mock('../src/session/manager.js', () => ({
  updateSubagentRunStatus: mocks.updateStatus,
}));

vi.mock('../src/config/index.js', () => ({
  getConfig: () => ({ acpSubagentMaxIterations: 3 }),
}));

vi.mock('../src/tools/registry.js', () => ({
  toolContextStorage: { run: (_context: unknown, callback: () => void) => callback() },
}));

vi.mock('../src/observability/logger.js', () => ({
  recordEvent: mocks.recordEvent,
}));

vi.mock('../src/agent/subagent/isolation.js', () => ({
  setupIsolation: () => ({ worktree: null, toolContext: {} }),
  finalizeWorktree: mocks.finalizeWorktree,
  teardownWorktree: mocks.teardownWorktree,
}));

import { runTask } from '../src/agent/subagent/executor.js';

describe('subagent recovery propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agent = undefined;
    mocks.finalizeWorktree.mockResolvedValue('');
  });

  it('clears tentative output and fails a task after a terminal recovery warning', async () => {
    const task: SubagentTask = {
      id: 'task-1',
      runId: 'run-1',
      parentTurnId: 'turn-1',
      parentSessionId: 'parent-1',
      sessionId: 'session-1',
      task: 'inspect files',
      status: 'queued',
      createdAt: new Date(),
    };
    const emitter = new EventEmitter<SubagentEvents>();
    const events: Array<[string, ...unknown[]]> = [];
    emitter.on('task:chunk', (...args) => events.push(['chunk', ...args]));
    emitter.on('task:clear', (...args) => events.push(['clear', ...args]));
    emitter.on('task:warning', (...args) => events.push(['warning', ...args]));
    emitter.on('task:failed', (...args) => events.push(['failed', ...args]));

    runTask({
      task,
      model: 'test-model',
      agents: new Map(),
      concurrency: {
        acquire: vi.fn(),
        release: vi.fn(),
      } as never,
      emitter,
      drainQueue: vi.fn(),
    });

    const agent = mocks.agent!;
    agent.emit('chunk', 'tentative draft');
    agent.emit('clear_streaming');
    agent.emit('chunk', 'recovered result');
    agent.emit('warning', 'recovery warning');
    agent.emit('done', '');
    await new Promise(resolve => setImmediate(resolve));

    expect(events).toEqual([
      ['chunk', 'task-1', 'tentative draft'],
      ['clear', 'task-1'],
      ['chunk', 'task-1', 'recovered result'],
      ['warning', 'task-1', 'recovery warning'],
      ['failed', 'task-1', 'recovery warning'],
    ]);
    expect(task.status).toBe('failed');
    expect(task.error).toBe('recovery warning');
    expect(task.result).toBeUndefined();
    expect(mocks.finalizeWorktree).not.toHaveBeenCalled();
    expect(mocks.teardownWorktree).toHaveBeenCalledWith(null);
    expect(mocks.recordEvent).toHaveBeenCalledWith('subagent_spawn', expect.objectContaining({
      turnId: 'turn-1',
      sessionId: 'parent-1',
      runId: 'run-1',
      taskId: 'task-1',
    }));
    expect(mocks.recordEvent).toHaveBeenCalledWith('subagent_done', expect.objectContaining({
      turnId: 'turn-1',
      sessionId: 'parent-1',
      runId: 'run-1',
      taskId: 'task-1',
    }));
  });
});
