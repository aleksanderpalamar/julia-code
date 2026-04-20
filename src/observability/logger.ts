import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type PlannerVia = 'heuristic' | 'llm' | 'cache';

export type ObservabilityEvent =
  | {
      type: 'planner_decision';
      ts: string;
      sessionId: string;
      complex: boolean;
      subtaskCount: number;
      via: PlannerVia;
      durationMs: number;
      taskPreview: string;
    }
  | {
      type: 'subagent_spawn';
      ts: string;
      runId: string;
      taskId: string;
      model: string | undefined;
      taskPreview: string;
    }
  | {
      type: 'subagent_done';
      ts: string;
      runId: string;
      taskId: string;
      status: 'completed' | 'failed';
      durationMs: number | undefined;
      error?: string;
    }
  | {
      type: 'tool_call';
      ts: string;
      sessionId: string;
      iteration: number;
      name: string;
      success: boolean;
      durationMs: number;
    }
  | {
      type: 'retry';
      ts: string;
      sessionId: string;
      iteration: number;
      kind: 'stream' | 'empty' | 'deterministic';
    }
  | {
      type: 'loop_end';
      ts: string;
      sessionId: string;
      iterations: number;
      reason: 'done' | 'max_iterations' | 'error' | 'aborted';
      tokensUsed?: number;
    };

export type ObservabilityEventType = ObservabilityEvent['type'];

function getLogDir(): string {
  const override = process.env.JULIA_LOG_DIR;
  if (override) return override;
  return join(homedir(), '.juliacode', 'logs');
}

function getLogFile(): string {
  return join(getLogDir(), 'events.jsonl');
}

let dirReady: Promise<void> | null = null;

async function ensureDir(): Promise<void> {
  if (!dirReady) {
    dirReady = mkdir(getLogDir(), { recursive: true, mode: 0o700 }).then(() => undefined);
  }
  return dirReady;
}

async function write(event: ObservabilityEvent): Promise<void> {
  try {
    await ensureDir();
    await appendFile(getLogFile(), JSON.stringify(event) + '\n', { mode: 0o600 });
  } catch {
    // Logger must never throw into hot paths.
  }
  if (process.env.JULIA_DEBUG === '1') {
    process.stderr.write(`[obs] ${JSON.stringify(event)}\n`);
  }
}

function now(): string {
  return new Date().toISOString();
}

function fire(event: ObservabilityEvent): void {
  void write(event);
}

export const log = {
  plannerDecision(args: {
    sessionId: string;
    complex: boolean;
    subtaskCount: number;
    via: PlannerVia;
    durationMs: number;
    taskPreview: string;
  }): void {
    fire({ type: 'planner_decision', ts: now(), ...args });
  },

  subagentSpawn(args: {
    runId: string;
    taskId: string;
    model: string | undefined;
    taskPreview: string;
  }): void {
    fire({ type: 'subagent_spawn', ts: now(), ...args });
  },

  subagentDone(args: {
    runId: string;
    taskId: string;
    status: 'completed' | 'failed';
    durationMs: number | undefined;
    error?: string;
  }): void {
    fire({ type: 'subagent_done', ts: now(), ...args });
  },

  toolCall(args: {
    sessionId: string;
    iteration: number;
    name: string;
    success: boolean;
    durationMs: number;
  }): void {
    fire({ type: 'tool_call', ts: now(), ...args });
  },

  retry(args: {
    sessionId: string;
    iteration: number;
    kind: 'stream' | 'empty' | 'deterministic';
  }): void {
    fire({ type: 'retry', ts: now(), ...args });
  },

  loopEnd(args: {
    sessionId: string;
    iterations: number;
    reason: 'done' | 'max_iterations' | 'error' | 'aborted';
    tokensUsed?: number;
  }): void {
    fire({ type: 'loop_end', ts: now(), ...args });
  },
};

export function getObservabilityLogPath(): string {
  return getLogFile();
}

export function resetLoggerStateForTests(): void {
  dirReady = null;
}
