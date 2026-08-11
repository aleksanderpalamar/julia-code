import { getDb } from '../../session/db.js';
import { average, groupBy, mapValues } from './event-log.js';
import type { OrchestrationMetrics, SubagentMetrics, SubagentModelMetrics } from './types.js';

type OrchestrationRow = {
  status: string;
  duration_ms: number | null;
  subtask_count: number;
};

type SubagentRow = {
  model: string | null;
  status: string;
  duration_ms: number | null;
};

const DEFAULT_MODEL_LABEL = 'default';

function isCompleted(row: { status: string }): boolean {
  return row.status === 'completed';
}

function isFailed(row: { status: string }): boolean {
  return row.status === 'failed';
}

function durations(rows: ReadonlyArray<{ duration_ms: number | null }>): number[] {
  return rows.map(row => row.duration_ms).filter((ms): ms is number => ms !== null);
}

function ratio(part: number, total: number): number {
  return total === 0 ? 0 : part / total;
}

export function computeOrchestrationMetrics(): OrchestrationMetrics {
  const rows = getDb()
    .prepare('SELECT status, duration_ms, subtask_count FROM orchestration_runs')
    .all() as OrchestrationRow[];

  const completed = rows.filter(isCompleted).length;

  return {
    totalRuns: rows.length,
    completedRuns: completed,
    failedRuns: rows.filter(isFailed).length,
    successRate: ratio(completed, rows.length),
    avgDurationMs: average(durations(rows)),
    avgSubtaskCount: average(rows.map(row => row.subtask_count)),
  };
}

function summarizeModel(rows: SubagentRow[]): SubagentModelMetrics {
  return {
    count: rows.length,
    completed: rows.filter(isCompleted).length,
    failed: rows.filter(isFailed).length,
    avgDurationMs: average(durations(rows)),
  };
}

export function computeSubagentMetrics(): SubagentMetrics {
  const rows = getDb()
    .prepare('SELECT model, status, duration_ms FROM subagent_runs')
    .all() as SubagentRow[];

  const failed = rows.filter(isFailed).length;

  return {
    totalTasks: rows.length,
    completedTasks: rows.filter(isCompleted).length,
    failedTasks: failed,
    failureRate: ratio(failed, rows.length),
    avgDurationMs: average(durations(rows)),
    perModel: mapValues(
      groupBy(rows, row => row.model ?? DEFAULT_MODEL_LABEL),
      summarizeModel,
    ),
  };
}
