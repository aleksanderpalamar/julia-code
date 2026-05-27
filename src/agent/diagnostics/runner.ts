import { spawn as nodeSpawn } from 'node:child_process';
import { buildSafeEnv } from '../../security/permissions.js';
import { stripAnsi } from '../../util/ansi.js';

/** Largest diagnostics report (chars) fed back to the model before truncation. */
const MAX_REPORT_CHARS = 6000;

/**
 * Hard ceiling on captured stdout+stderr before the runner gives up and kills
 * the child. Without this a noisy check (infinite logger, accidental `yes`) can
 * grow Julia's memory unbounded long before `MAX_REPORT_CHARS` truncation kicks
 * in. Kept slightly above the report cap so we still have material to truncate.
 */
const MAX_CAPTURE_CHARS = MAX_REPORT_CHARS * 2;

export type DiagnosticOutcome = { ok: true } | { ok: false; report: string };

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputCapped: boolean;
}

export interface RunProcessOptions {
  cwd: string;
  timeoutMs: number;
  signal: AbortSignal | undefined;
  env: Record<string, string>;
}

/**
 * Runs a shell command and resolves with its captured output. Injected into
 * {@link runDiagnostics} so the report logic can be tested without spawning a
 * real subprocess (DIP).
 */
export type ProcessRunner = (command: string, opts: RunProcessOptions) => Promise<ProcessResult>;

export interface DiagnosticsRunInput {
  command: string;
  cwd: string;
  changedFiles: string[];
  timeoutMs: number;
  signal: AbortSignal | undefined;
  run?: ProcessRunner;
}

/**
 * Runs the configured project check command (e.g. `tsc --noEmit`) after edits
 * and turns a non-zero result into a model-readable report. A clean exit (or a
 * cancelled run) yields `{ ok: true }` so the caller stays silent.
 */
export async function runDiagnostics(input: DiagnosticsRunInput): Promise<DiagnosticOutcome> {
  const { command, cwd, changedFiles, timeoutMs, signal } = input;
  if (signal?.aborted) return { ok: true };

  const run = input.run ?? defaultProcessRunner;
  const result = await run(command, { cwd, timeoutMs, signal, env: buildSafeEnv() });

  if (signal?.aborted) return { ok: true };
  if (result.code === 0) return { ok: true };

  return { ok: false, report: buildReport(command, changedFiles, result) };
}

function buildReport(command: string, changedFiles: string[], result: ProcessResult): string {
  const raw = stripAnsi([result.stdout, result.stderr].filter(Boolean).join('\n')).trim();
  const body = raw.length > MAX_REPORT_CHARS
    ? `${raw.slice(0, MAX_REPORT_CHARS)}\n... (output truncated)`
    : raw;

  const files = changedFiles.length ? ` (after editing: ${changedFiles.join(', ')})` : '';
  const header = result.timedOut
    ? `Diagnostics command timed out${files}: ${command}`
    : result.outputCapped
      ? `Diagnostics command produced excessive output and was killed${files}: ${command}`
      : `Diagnostics command reported problems${files}: ${command}`;

  return body ? `${header}\n${body}` : header;
}

export const defaultProcessRunner: ProcessRunner = (command, { cwd, timeoutMs, signal, env }) =>
  new Promise<ProcessResult>((resolve) => {
    const isWindows = process.platform === 'win32';
    const child = nodeSpawn(command, {
      cwd,
      env,
      shell: true,
      detached: !isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let outputCapped = false;
    let settled = false;

    // With `shell: true`, killing the child only kills the shell — the real
    // command (e.g. `pnpm test`) keeps running as an orphan. On POSIX we make
    // the child a process group leader and signal the whole group; on Windows
    // there is no equivalent, so a best-effort `child.kill` is the most we can
    // portably do.
    const killTree = () => {
      if (child.pid === undefined) return;
      if (isWindows) {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
        return;
      }
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try { child.kill('SIGKILL'); } catch { /* already gone */ }
      }
    };

    const appendCapped = (chunk: string, target: 'stdout' | 'stderr') => {
      if (outputCapped) return;
      const remaining = MAX_CAPTURE_CHARS - (stdout.length + stderr.length);
      if (chunk.length <= remaining) {
        if (target === 'stdout') stdout += chunk;
        else stderr += chunk;
        return;
      }
      const fit = remaining > 0 ? chunk.slice(0, remaining) : '';
      if (target === 'stdout') stdout += fit;
      else stderr += fit;
      outputCapped = true;
      killTree();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, timeoutMs);

    const onAbort = () => killTree();
    signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code, stdout, stderr, timedOut, outputCapped });
    };

    child.stdout?.on('data', (d: Buffer) => appendCapped(d.toString(), 'stdout'));
    child.stderr?.on('data', (d: Buffer) => appendCapped(d.toString(), 'stderr'));
    child.on('error', (err) => {
      appendCapped(`\n${err instanceof Error ? err.message : String(err)}`, 'stderr');
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
