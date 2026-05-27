import { describe, it, expect, vi } from 'vitest';
import { runDiagnostics, type ProcessRunner, type ProcessResult } from '../src/agent/diagnostics/runner.js';

const baseInput = {
  command: 'tsc --noEmit',
  cwd: '/repo',
  changedFiles: ['src/foo.ts'],
  timeoutMs: 1000,
  signal: undefined,
};

function runnerReturning(result: ProcessResult): ProcessRunner {
  return vi.fn(async () => result);
}

describe('runDiagnostics', () => {
  it('returns ok when the command exits cleanly', async () => {
    const run = runnerReturning({ code: 0, stdout: '', stderr: '', timedOut: false });
    const out = await runDiagnostics({ ...baseInput, run });
    expect(out).toEqual({ ok: true });
  });

  it('reports problems with the command, changed files and output on non-zero exit', async () => {
    const tscOut = "src/foo.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    const run = runnerReturning({ code: 2, stdout: tscOut, stderr: '', timedOut: false });

    const out = await runDiagnostics({ ...baseInput, run });

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.report).toContain('tsc --noEmit');
      expect(out.report).toContain('after editing: src/foo.ts');
      expect(out.report).toContain('TS2322');
    }
  });

  it('strips ANSI escapes from the report', async () => {
    const run = runnerReturning({ code: 1, stdout: '\x1B[31merror\x1B[0m boom', stderr: '', timedOut: false });
    const out = await runDiagnostics({ ...baseInput, run });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.report).toContain('error boom');
      expect(out.report).not.toContain('\x1B');
    }
  });

  it('truncates very long output', async () => {
    const run = runnerReturning({ code: 1, stdout: 'x'.repeat(7000), stderr: '', timedOut: false });
    const out = await runDiagnostics({ ...baseInput, run });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.report).toContain('... (output truncated)');
  });

  it('flags a timeout in the report', async () => {
    const run = runnerReturning({ code: null, stdout: '', stderr: '', timedOut: true });
    const out = await runDiagnostics({ ...baseInput, run });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.report).toContain('timed out');
  });

  it('skips the run entirely when already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const run = vi.fn();
    const out = await runDiagnostics({ ...baseInput, signal: ctrl.signal, run });
    expect(out).toEqual({ ok: true });
    expect(run).not.toHaveBeenCalled();
  });

  it('discards the report when aborted during the run', async () => {
    const ctrl = new AbortController();
    const run: ProcessRunner = async () => {
      ctrl.abort();
      return { code: 1, stdout: 'errors', stderr: '', timedOut: false };
    };
    const out = await runDiagnostics({ ...baseInput, signal: ctrl.signal, run });
    expect(out).toEqual({ ok: true });
  });
});
