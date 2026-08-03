import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  computeBudget: vi.fn(),
  getMessages: vi.fn(),
  selectMessagesForRetention: vi.fn(),
}));

vi.mock('../src/session/manager.js', () => ({
  getMessages: mocks.getMessages,
  getLatestCompaction: () => null,
  getLatestUserMessage: () => null,
  getLastAssistantModel: () => null,
}));

vi.mock('../src/skills/loader.js', () => ({
  loadSkills: () => [],
  loadUserSkills: () => [],
  loadTemperamentSkill: () => null,
}));

vi.mock('../src/config/index.js', () => ({ getConfig: () => ({}) }));
vi.mock('../src/config/workspace.js', () => ({ getProjectDir: () => '/project' }));
vi.mock('../src/context/budget.js', () => ({ computeBudget: mocks.computeBudget }));
vi.mock('../src/context/task-anchor.js', () => ({
  extractTaskAnchor: () => null,
  formatTaskAnchor: vi.fn(),
}));
vi.mock('../src/context/message-scorer.js', () => ({
  selectMessagesForRetention: mocks.selectMessagesForRetention,
}));
vi.mock('../src/context/compaction.js', () => ({
  deserializeCompaction: vi.fn(),
  formatCompactionForContext: vi.fn(),
}));
vi.mock('../src/context/health.js', () => ({
  assessHealth: () => ({
    totalBudget: 7000,
    usedTokens: 0,
    usagePercent: 0,
    warningLevel: 'ok',
  }),
  getContextWarningMessage: () => null,
}));
vi.mock('../src/memory/pipeline.js', () => ({ prepareMemoryContext: async () => '' }));
vi.mock('../src/repo-intel/pipeline.js', () => ({ prepareRepoCodeContext: async () => '' }));

import { buildContext } from '../src/agent/context.js';
import { estimateMessagesTokens } from '../src/context/token-counter.js';

const budget = {
  total: 8000,
  reservedForOutput: 1000,
  available: 7000,
  systemPrompt: 500,
  taskAnchor: 0,
  memories: 0,
  repoCode: 0,
  compactedHistory: 0,
  recentMessages: 6500,
};

describe('buildContext / transient recovery content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.computeBudget.mockResolvedValue(budget);
    mocks.getMessages.mockReturnValue([]);
    mocks.selectMessagesForRetention.mockReturnValue({ toKeep: [], toCompact: [] });
  });

  it('includes the nudge and discarded draft in one context without carrying them forward', async () => {
    const nudge = '[intent-without-action] use a tool or answer directly';
    const draft = 'Let me check the package file.';

    const recovery = await buildContext('session-1', 'model-1', {
      iteration: 2,
      maxIterations: 5,
      transientSystemContent: nudge,
      transientAssistantContent: draft,
    });
    const later = await buildContext('session-1', 'model-1', {
      iteration: 3,
      maxIterations: 5,
    });

    expect(recovery.messages.some(message => message.content.includes(nudge))).toBe(true);
    expect(recovery.messages.at(-1)).toEqual({ role: 'assistant', content: draft });
    expect(later.messages.some(message => message.content.includes(nudge))).toBe(false);
    expect(later.messages.some(message => message.content === draft)).toBe(false);
    expect(mocks.computeBudget.mock.calls[0][1]).toContain(nudge);
    expect(mocks.computeBudget.mock.calls[0][1]).not.toContain(draft);
    expect(mocks.computeBudget.mock.calls[1][1]).not.toContain(nudge);
  });

  it('caps the discarded draft and reserves its tokens before retaining history', async () => {
    const history = Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      session_id: 'session-1',
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: 'h'.repeat(4000),
      created_at: '2026-08-03T00:00:00Z',
    }));
    const pendingTail = 'Let me check the package file now.';
    mocks.getMessages.mockReturnValue(history);

    const recovery = await buildContext('session-1', 'model-1', {
      iteration: 2,
      maxIterations: 5,
      transientAssistantContent: 'x'.repeat(10000) + pendingTail,
    });

    const draft = recovery.messages.at(-1)!;
    const draftTokens = estimateMessagesTokens([draft]);
    expect(draft.role).toBe('assistant');
    expect(draft.content).toContain('[... earlier draft truncated ...]');
    expect(draft.content.endsWith(pendingTail)).toBe(true);
    expect(draftTokens).toBeLessThanOrEqual(512);
    expect(mocks.selectMessagesForRetention).toHaveBeenCalledWith(
      history,
      budget.recentMessages - draftTokens,
    );
  });
});
