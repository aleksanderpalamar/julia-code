import { execSync } from 'node:child_process';
import { getSettings } from '../config/index.js';
import { buildSafeEnv } from '../security/permissions.js';
import { logMcp } from '../mcp/logger.js';
import type {
  HookEventName,
  HookOutcome,
  HookPayload,
  HookStdoutShape,
} from './types.js';
import type { HookCommand, HookEntry } from './schema.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 1024 * 1024;

interface RunHookOpts {
  matchKey?: string;
}

export async function runHook(
  event: HookEventName,
  payload: HookPayload,
  opts?: RunHookOpts,
): Promise<HookOutcome> {
  const entries = getEntriesForEvent(event);
  if (!entries || entries.length === 0) return passThroughOutcome();

  const matched = filterEntries(entries, opts?.matchKey);
  if (matched.length === 0) return passThroughOutcome();

  const aggregate: HookOutcome = passThroughOutcome();
  const contextParts: string[] = [];

  for (const entry of matched) {
    for (const cmd of entry.hooks) {
      const single = runSingle(event, cmd, payload);
      mergeOutcome(aggregate, single, contextParts);
      if (aggregate.decision === 'block' || aggregate.continue === false) {
        if (contextParts.length > 0) aggregate.additionalContext = contextParts.join('\n\n');
        return aggregate;
      }
    }
  }

  if (contextParts.length > 0) aggregate.additionalContext = contextParts.join('\n\n');
  return aggregate;
}

function passThroughOutcome(): HookOutcome {
  return { decision: 'none', continue: true };
}

function mergeOutcome(into: HookOutcome, next: HookOutcome, contextParts: string[]): void {
  if (next.decision === 'block' && into.decision !== 'block') {
    into.decision = 'block';
    into.reason = next.reason;
  } else if (next.decision === 'approve' && into.decision === 'none') {
    into.decision = 'approve';
    into.reason = next.reason;
  }
  if (next.continue === false) {
    into.continue = false;
    if (next.stopReason && !into.stopReason) into.stopReason = next.stopReason;
  }
  if (next.additionalContext) contextParts.push(next.additionalContext);
}

function getEntriesForEvent(event: HookEventName): HookEntry[] | undefined {
  const settings = getSettings();
  return settings?.hooks?.[event] as HookEntry[] | undefined;
}

function filterEntries(entries: HookEntry[], matchKey: string | undefined): HookEntry[] {
  return entries.filter(entry => {
    if (!entry.matcher || entry.matcher === '*' || entry.matcher === '') return true;
    if (matchKey === undefined) return true;
    try {
      const regex = new RegExp(entry.matcher);
      return regex.test(matchKey);
    } catch {
      logMcp(`[hooks] matcher inválido (regex): ${entry.matcher} — entry ignorado`);
      return false;
    }
  });
}

function runSingle(event: HookEventName, cmd: HookCommand, payload: HookPayload): HookOutcome {
  const timeout = cmd.timeout ?? DEFAULT_TIMEOUT_MS;
  const env = buildSafeEnv({ JULIA_HOOK: '1', JULIA_HOOK_EVENT: event });
  const input = JSON.stringify(payload);

  const startedAt = Date.now();
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    stdout = execSync(cmd.command, {
      timeout,
      encoding: 'utf-8',
      maxBuffer: MAX_BUFFER,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      input,
      cwd: payload.cwd,
    });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string; status?: number };
    stdout = e.stdout ?? '';
    stderr = e.stderr ?? '';
    exitCode = typeof e.status === 'number' ? e.status : 1;
    if (exitCode === 0) exitCode = 1;
  }

  const durationMs = Date.now() - startedAt;

  if (exitCode === 2) {
    logMcp(`[hooks] ${event} bloqueou (exit 2): ${truncate(cmd.command, 60)} — ${durationMs}ms`);
    return { decision: 'block', reason: stderr.trim() || 'Blocked by hook (exit 2)', continue: true };
  }

  if (exitCode !== 0) {
    logMcp(`[hooks] ${event} falhou (exit ${exitCode}): ${truncate(cmd.command, 60)} — ${truncate(stderr.trim(), 200)}`);
    return passThroughOutcome();
  }

  const parsed = tryParseJson(stdout);
  if (parsed) {
    return outcomeFromJson(parsed, event);
  }

  if (eventAcceptsRawStdoutAsContext(event) && stdout.trim()) {
    return { decision: 'none', continue: true, additionalContext: stdout.trim() };
  }

  return passThroughOutcome();
}

function tryParseJson(stdout: string): HookStdoutShape | null {
  const trimmed = stdout.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') return parsed as HookStdoutShape;
  } catch {
    return null;
  }
  return null;
}

function outcomeFromJson(data: HookStdoutShape, _event: HookEventName): HookOutcome {
  const outcome: HookOutcome = passThroughOutcome();
  if (data.decision === 'block') {
    outcome.decision = 'block';
    outcome.reason = data.reason;
  } else if (data.decision === 'approve') {
    outcome.decision = 'approve';
    outcome.reason = data.reason;
  }
  if (data.continue === false) {
    outcome.continue = false;
    outcome.stopReason = data.stopReason;
  }
  if (data.hookSpecificOutput?.additionalContext) {
    outcome.additionalContext = data.hookSpecificOutput.additionalContext;
  }
  return outcome;
}

function eventAcceptsRawStdoutAsContext(event: HookEventName): boolean {
  return event === 'UserPromptSubmit' || event === 'SessionStart' || event === 'PreCompact';
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}
