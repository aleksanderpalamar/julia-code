import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AllowRule } from '../src/security/permissions.js';
import { evaluateToolCall } from '../src/agent/security-gate.js';

vi.mock('../src/security/permissions.js', async () => {
  return {
    getToolRisk: vi.fn(),
    isBlockedCommand: vi.fn(),
    matchesAllowRule: vi.fn(),
  };
});

import { getToolRisk, isBlockedCommand, matchesAllowRule } from '../src/security/permissions.js';

function makeRef(value = false) {
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
