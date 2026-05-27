import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runDiagnostics,
  defaultProcessRunner,
  type ProcessRunner,
  type ProcessResult,
} from '../src/agent/diagnostics/runner.js';

const baseInput = {
  command: 'tsc --noEmit',
  cwd: '/repo',
  changedFiles: ['src/foo.ts'],
  timeoutMs: 1000,
  signal: undefined,
};

function runnerReturning(result: Partial<ProcessResult> & { code: number | null }): ProcessRunner {
  const filled: ProcessResult = {
    stdout: '',
    stderr: '',
    timedOut: false,
    outputCapped: false,
    ...result,
  };
  return vi.fn(async () => filled);
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

  it('flags an output cap kill in the report', async () => {
    const run = runnerReturning({ code: null, stdout: 'noise', stderr: '', outputCapped: true });
    const out = await runDiagnostics({ ...baseInput, run });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.report).toContain('produced excessive output');
      expect(out.report).not.toContain('timed out');
    }
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

const describeOnPosix = process.platform === 'win32' ? describe.skip : describe;

describeOnPosix('defaultProcessRunner (integration)', () => {
  it('caps captured output and kills the child instead of buffering unbounded data', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'julia-diag-cap-'));
    try {
      // Infinite loop spewing data; with the cap the runner must kill it and
      // resolve well before the 5s timeout, with bounded captured output.
      const command = `sh -c 'while true; do printf "noise"; done'`;
      const startedAt = Date.now();
      const result = await defaultProcessRunner(command, {
        cwd: tmp,
        timeoutMs: 5000,
        signal: undefined,
        env: process.env as Record<string, string>,
      });
      const elapsed = Date.now() - startedAt;

      expect(result.outputCapped).toBe(true);
      expect(result.timedOut).toBe(false);
      // Allow some slack for the final chunk that arrives between cap-detection
      // and the child actually dying (kernel buffers etc.), but it must stay
      // small relative to "unbounded".
      expect(result.stdout.length + result.stderr.length).toBeLessThan(64 * 1024);
      expect(elapsed).toBeLessThan(4500);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('kills the entire process tree on timeout, not just the shell', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'julia-diag-runner-'));
    const pidFile = join(tmp, 'sleep.pid');
    try {
      // bash forks `sleep 30` in the background, records its pid, then waits.
      // Without process-group kill the inner sleep would be orphaned and keep
      // running after the timeout fires.
      const command = `sh -c 'sleep 30 & echo $! > ${pidFile}; wait'`;

      const result = await defaultProcessRunner(command, {
        cwd: tmp,
        timeoutMs: 250,
        signal: undefined,
        env: process.env as Record<string, string>,
      });

      expect(result.timedOut).toBe(true);

      // Give the kernel a moment to reap the killed group.
      await new Promise((r) => setTimeout(r, 100));

      expect(existsSync(pidFile)).toBe(true);
      const sleepPid = Number(readFileSync(pidFile, 'utf-8').trim());
      expect(Number.isFinite(sleepPid)).toBe(true);

      // `kill 0` probes existence without signalling; ESRCH means gone.
      let stillAlive = true;
      try {
        process.kill(sleepPid, 0);
      } catch (err) {
        stillAlive = (err as NodeJS.ErrnoException).code !== 'ESRCH';
      }
      expect(stillAlive).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
