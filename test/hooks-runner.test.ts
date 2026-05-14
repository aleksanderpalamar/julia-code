import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/index.js', () => ({
  getSettings: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../src/mcp/logger.js', () => ({
  logMcp: vi.fn(),
}));

vi.mock('../src/security/permissions.js', () => ({
  buildSafeEnv: vi.fn().mockImplementation((extra?: Record<string, string>) => ({
    PATH: '/usr/bin',
    ...extra,
  })),
}));

import { runHook } from '../src/hooks/runner.js';
import { getSettings } from '../src/config/index.js';
import { execSync } from 'node:child_process';
import { logMcp } from '../src/mcp/logger.js';
import type { PreToolUsePayload, UserPromptSubmitPayload } from '../src/hooks/types.js';

function basePreToolUse(overrides?: Partial<PreToolUsePayload>): PreToolUsePayload {
  return {
    session_id: 's1',
    cwd: '/tmp',
    hook_event_name: 'PreToolUse',
    tool_name: 'exec',
    tool_input: { command: 'ls' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getSettings).mockReset();
  vi.mocked(execSync).mockReset();
  vi.mocked(logMcp).mockReset();
});

describe('runHook / no config', () => {
  it('returns pass-through when no hooks configured', async () => {
    vi.mocked(getSettings).mockReturnValue(null);
    const outcome = await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(outcome.decision).toBe('none');
    expect(outcome.continue).toBe(true);
    expect(execSync).not.toHaveBeenCalled();
  });

  it('returns pass-through when event has no entries', async () => {
    vi.mocked(getSettings).mockReturnValue({ hooks: {} } as never);
    const outcome = await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(outcome.decision).toBe('none');
    expect(execSync).not.toHaveBeenCalled();
  });
});

describe('runHook / matcher', () => {
  it('runs when matcher matches', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ matcher: 'exec', hooks: [{ type: 'command', command: 'audit.sh' }] }] },
    } as never);
    vi.mocked(execSync).mockReturnValue('');
    await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(execSync).toHaveBeenCalledOnce();
  });

  it('skips when matcher does not match', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ matcher: '^write$', hooks: [{ type: 'command', command: 'audit.sh' }] }] },
    } as never);
    await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(execSync).not.toHaveBeenCalled();
  });

  it('runs when matcher is "*"', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'audit.sh' }] }] },
    } as never);
    vi.mocked(execSync).mockReturnValue('');
    await runHook('PreToolUse', basePreToolUse(), { matchKey: 'whatever' });
    expect(execSync).toHaveBeenCalledOnce();
  });

  it('runs when matcher is omitted', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'audit.sh' }] }] },
    } as never);
    vi.mocked(execSync).mockReturnValue('');
    await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(execSync).toHaveBeenCalledOnce();
  });

  it('skips entry with invalid regex and logs', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ matcher: '[invalid', hooks: [{ type: 'command', command: 'audit.sh' }] }] },
    } as never);
    await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(execSync).not.toHaveBeenCalled();
    expect(logMcp).toHaveBeenCalled();
  });
});

describe('runHook / exit codes', () => {
  it('exit 0 with empty stdout → pass-through', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ matcher: 'exec', hooks: [{ type: 'command', command: 'noop' }] }] },
    } as never);
    vi.mocked(execSync).mockReturnValue('');
    const outcome = await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(outcome.decision).toBe('none');
  });

  it('exit 2 → block with stderr as reason', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ matcher: 'exec', hooks: [{ type: 'command', command: 'deny' }] }] },
    } as never);
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error('exit 2') as Error & { status: number; stdout: string; stderr: string };
      err.status = 2;
      err.stdout = '';
      err.stderr = 'Forbidden command';
      throw err;
    });
    const outcome = await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(outcome.decision).toBe('block');
    expect(outcome.reason).toBe('Forbidden command');
  });

  it('exit 1 (other non-zero) → pass-through and logs', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ matcher: 'exec', hooks: [{ type: 'command', command: 'broken' }] }] },
    } as never);
    vi.mocked(execSync).mockImplementation(() => {
      const err = new Error('failed') as Error & { status: number; stdout: string; stderr: string };
      err.status = 1;
      err.stdout = '';
      err.stderr = 'something broke';
      throw err;
    });
    const outcome = await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(outcome.decision).toBe('none');
    expect(outcome.continue).toBe(true);
    expect(logMcp).toHaveBeenCalled();
  });
});

describe('runHook / JSON stdout', () => {
  it('parses decision=block from JSON output', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ matcher: 'exec', hooks: [{ type: 'command', command: 'json' }] }] },
    } as never);
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ decision: 'block', reason: 'no shell today' }));
    const outcome = await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(outcome.decision).toBe('block');
    expect(outcome.reason).toBe('no shell today');
  });

  it('parses decision=approve from JSON output and propagates to aggregate', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ matcher: 'exec', hooks: [{ type: 'command', command: 'allowlist' }] }] },
    } as never);
    vi.mocked(execSync).mockReturnValue(JSON.stringify({ decision: 'approve', reason: 'on the allowlist' }));
    const outcome = await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(outcome.decision).toBe('approve');
    expect(outcome.reason).toBe('on the allowlist');
  });

  it('extracts hookSpecificOutput.additionalContext', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'inject' }] }] },
    } as never);
    vi.mocked(execSync).mockReturnValue(
      JSON.stringify({ hookSpecificOutput: { additionalContext: 'remember security' } }),
    );
    const payload: UserPromptSubmitPayload = {
      session_id: 's1',
      cwd: '/tmp',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'hi',
    };
    const outcome = await runHook('UserPromptSubmit', payload);
    expect(outcome.additionalContext).toBe('remember security');
  });
});

describe('runHook / raw stdout fallback', () => {
  it('UserPromptSubmit treats raw stdout as additionalContext', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo' }] }] },
    } as never);
    vi.mocked(execSync).mockReturnValue('extra context line');
    const payload: UserPromptSubmitPayload = {
      session_id: 's1',
      cwd: '/tmp',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'hi',
    };
    const outcome = await runHook('UserPromptSubmit', payload);
    expect(outcome.additionalContext).toBe('extra context line');
  });

  it('PreToolUse ignores raw stdout (does not accept context)', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ matcher: 'exec', hooks: [{ type: 'command', command: 'echo' }] }] },
    } as never);
    vi.mocked(execSync).mockReturnValue('this is just a log line');
    const outcome = await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(outcome.additionalContext).toBeUndefined();
    expect(outcome.decision).toBe('none');
  });
});

describe('runHook / aggregation', () => {
  it('first block wins; short-circuits subsequent commands', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: {
        PreToolUse: [
          { matcher: 'exec', hooks: [
            { type: 'command', command: 'first' },
            { type: 'command', command: 'second' },
          ]},
        ],
      },
    } as never);
    vi.mocked(execSync).mockImplementationOnce(() => {
      const err = new Error('blocked') as Error & { status: number; stdout: string; stderr: string };
      err.status = 2;
      err.stdout = '';
      err.stderr = 'nope';
      throw err;
    });
    const outcome = await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(outcome.decision).toBe('block');
    expect(execSync).toHaveBeenCalledTimes(1);
  });

  it('block beats approve when both fire', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: {
        PreToolUse: [
          { matcher: 'exec', hooks: [
            { type: 'command', command: 'approver' },
            { type: 'command', command: 'denier' },
          ]},
        ],
      },
    } as never);
    vi.mocked(execSync)
      .mockReturnValueOnce(JSON.stringify({ decision: 'approve', reason: 'ok' }))
      .mockImplementationOnce(() => {
        const err = new Error('blocked') as Error & { status: number; stdout: string; stderr: string };
        err.status = 2;
        err.stdout = '';
        err.stderr = 'nope';
        throw err;
      });
    const outcome = await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(outcome.decision).toBe('block');
    expect(outcome.reason).toBe('nope');
  });

  it('approve from one hook survives pass-through from another', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: {
        PreToolUse: [
          { matcher: 'exec', hooks: [
            { type: 'command', command: 'approver' },
            { type: 'command', command: 'silent' },
          ]},
        ],
      },
    } as never);
    vi.mocked(execSync)
      .mockReturnValueOnce(JSON.stringify({ decision: 'approve', reason: 'ok' }))
      .mockReturnValueOnce('');
    const outcome = await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    expect(outcome.decision).toBe('approve');
    expect(outcome.reason).toBe('ok');
  });

  it('concatenates additionalContext from multiple hooks', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: 'command', command: 'a' }] },
          { hooks: [{ type: 'command', command: 'b' }] },
        ],
      },
    } as never);
    vi.mocked(execSync).mockReturnValueOnce('alpha').mockReturnValueOnce('beta');
    const payload: UserPromptSubmitPayload = {
      session_id: 's1',
      cwd: '/tmp',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'hi',
    };
    const outcome = await runHook('UserPromptSubmit', payload);
    expect(outcome.additionalContext).toBe('alpha\n\nbeta');
  });
});

describe('runHook / env and stdin', () => {
  it('sets JULIA_HOOK and JULIA_HOOK_EVENT and pipes JSON payload to stdin', async () => {
    vi.mocked(getSettings).mockReturnValue({
      hooks: { PreToolUse: [{ matcher: 'exec', hooks: [{ type: 'command', command: 'inspect' }] }] },
    } as never);
    vi.mocked(execSync).mockReturnValue('');
    await runHook('PreToolUse', basePreToolUse(), { matchKey: 'exec' });
    const call = vi.mocked(execSync).mock.calls[0];
    const opts = call[1] as { env: Record<string, string>; input: string };
    expect(opts.env.JULIA_HOOK).toBe('1');
    expect(opts.env.JULIA_HOOK_EVENT).toBe('PreToolUse');
    const parsed = JSON.parse(opts.input);
    expect(parsed.tool_name).toBe('exec');
    expect(parsed.hook_event_name).toBe('PreToolUse');
  });
});
