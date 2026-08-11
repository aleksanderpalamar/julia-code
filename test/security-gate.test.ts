import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AllowRule } from '../src/security/permissions.js';
import { evaluateToolCall } from '../src/agent/security-gate.js';
import type { QuotaVerdict } from '../src/security/rate-limit.js';

vi.mock('../src/security/permissions.js', async () => {
  return {
    getToolRisk: vi.fn(),
    isBlockedCommand: vi.fn(),
    matchesAllowRule: vi.fn(),
  };
});

import { getToolRisk, isBlockedCommand, matchesAllowRule } from '../src/security/permissions.js';

function makeRef(value = false): { current: boolean } {
  return { current: value };
}

beforeEach(() => {
  vi.mocked(getToolRisk).mockReset();
  vi.mocked(isBlockedCommand).mockReset();
  vi.mocked(matchesAllowRule).mockReset();
});

describe('evaluateToolCall / blocklist', () => {
  it('returns blocked for exec + blocked command', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(true);

    const requestApproval = vi.fn();
    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'rm -rf /' },
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval,
    });

    expect(outcome.kind).toBe('blocked');
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('does not check blocklist for non-exec tools', async () => {
    vi.mocked(getToolRisk).mockReturnValue('low');

    const outcome = await evaluateToolCall({
      toolName: 'read',
      args: { command: 'rm -rf /' },
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval: vi.fn(),
    });

    expect(outcome.kind).toBe('allowed');
    expect(isBlockedCommand).not.toHaveBeenCalled();
  });
});

describe('evaluateToolCall / approval flow', () => {
  it('allows low-risk tools without prompting', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('low');

    const requestApproval = vi.fn();
    const outcome = await evaluateToolCall({
      toolName: 'read',
      args: {},
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval,
    });

    expect(outcome.kind).toBe('allowed');
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('allows dangerous tools when preApproved is true (PreToolUse hook approve)', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('dangerous');

    const requestApproval = vi.fn();
    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'ls' },
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval,
      preApproved: true,
    });

    expect(outcome.kind).toBe('allowed');
    expect(requestApproval).not.toHaveBeenCalled();
    expect(matchesAllowRule).not.toHaveBeenCalled();
  });

  it('preApproved still respects the hardcoded blocklist', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(true);

    const requestApproval = vi.fn();
    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'rm -rf /' },
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval,
      preApproved: true,
    });

    expect(outcome.kind).toBe('blocked');
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('allows dangerous tools when approvedAllForSession is set', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('dangerous');

    const requestApproval = vi.fn();
    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'ls' },
      allowRules: [],
      approvedAllForSession: makeRef(true),
      requestApproval,
    });

    expect(outcome.kind).toBe('allowed');
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('allows dangerous tools matching an allow-rule without prompting', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('dangerous');
    vi.mocked(matchesAllowRule).mockReturnValue(true);

    const requestApproval = vi.fn();
    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'ls' },
      allowRules: [{ tool: 'exec' } as unknown as AllowRule],
      approvedAllForSession: makeRef(),
      requestApproval,
    });

    expect(outcome.kind).toBe('allowed');
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it('returns denied when user denies', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('dangerous');
    vi.mocked(matchesAllowRule).mockReturnValue(false);

    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'ls' },
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval: async () => 'deny',
    });

    expect(outcome.kind).toBe('denied');
  });

  it('returns approve_all and flips the ref when user approves all', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('dangerous');
    vi.mocked(matchesAllowRule).mockReturnValue(false);

    const ref = makeRef();
    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'ls' },
      allowRules: [],
      approvedAllForSession: ref,
      requestApproval: async () => 'approve_all',
    });

    expect(outcome.kind).toBe('approve_all');
    expect(ref.current).toBe(true);
  });

  it('returns allowed when user approves once', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('dangerous');
    vi.mocked(matchesAllowRule).mockReturnValue(false);

    const ref = makeRef();
    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'ls' },
      allowRules: [],
      approvedAllForSession: ref,
      requestApproval: async () => 'approve',
    });

    expect(outcome.kind).toBe('allowed');
    expect(ref.current).toBe(false);
  });
});

describe('evaluateToolCall / quotas', () => {
  function guard(verdict: QuotaVerdict) {
    return {
      check: vi.fn().mockReturnValue(verdict),
      record: vi.fn(),
    };
  }

  it('refuses the call and never prompts when the minute window is exhausted', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('dangerous');

    const requestApproval = vi.fn();
    const quotas = guard({ kind: 'exceeded', scope: 'minute', retryAfterMs: 5000 });

    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'ls' },
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval,
      quotas,
      now: () => 1_000,
    });

    expect(outcome.kind).toBe('rate_limited');
    expect(outcome).toMatchObject({ via: 'quota' });
    expect(requestApproval).not.toHaveBeenCalled();
    expect(quotas.record).not.toHaveBeenCalled();
  });

  it('enforces the quota even when the session already approved everything', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('dangerous');

    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'ls' },
      allowRules: [],
      approvedAllForSession: makeRef(true),
      requestApproval: vi.fn(),
      quotas: guard({ kind: 'exceeded', scope: 'session' }),
    });

    expect(outcome.kind).toBe('rate_limited');
  });

  it('enforces the quota even when a hook pre-approved the call', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);

    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'ls' },
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval: vi.fn(),
      preApproved: true,
      quotas: guard({ kind: 'exceeded', scope: 'session' }),
    });

    expect(outcome.kind).toBe('rate_limited');
  });

  it('keeps a blocklisted command blocked even with quota remaining', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(true);
    const quotas = guard({ kind: 'within' });

    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'rm -rf /' },
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval: vi.fn(),
      quotas,
    });

    expect(outcome.kind).toBe('blocked');
    expect(outcome).toMatchObject({ via: 'blocklist' });
    expect(quotas.check).not.toHaveBeenCalled();
  });

  it('records the hit when the call is allowed', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('safe');
    const quotas = guard({ kind: 'within' });

    const outcome = await evaluateToolCall({
      toolName: 'read',
      args: { path: 'a.ts' },
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval: vi.fn(),
      quotas,
      now: () => 4_242,
    });

    expect(outcome).toEqual({ kind: 'allowed', via: 'risk' });
    expect(quotas.record).toHaveBeenCalledWith('read', 4_242);
  });

  it('does not spend quota on a call the user denied', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('dangerous');
    vi.mocked(matchesAllowRule).mockReturnValue(false);
    const quotas = guard({ kind: 'within' });

    const outcome = await evaluateToolCall({
      toolName: 'exec',
      args: { command: 'ls' },
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval: async () => 'deny',
      quotas,
    });

    expect(outcome).toEqual({ kind: 'denied', via: 'user' });
    expect(quotas.record).not.toHaveBeenCalled();
  });

  it('behaves exactly as before when no quota guard is supplied', async () => {
    vi.mocked(isBlockedCommand).mockReturnValue(false);
    vi.mocked(getToolRisk).mockReturnValue('safe');

    const outcome = await evaluateToolCall({
      toolName: 'read',
      args: { path: 'a.ts' },
      allowRules: [],
      approvedAllForSession: makeRef(),
      requestApproval: vi.fn(),
    });

    expect(outcome).toEqual({ kind: 'allowed', via: 'risk' });
  });
});
