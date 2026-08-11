import type { LoopEndReason, ObservabilityEvent, PlannerVia, RetryKind } from '../events.js';
import { average, countOccurrences, selectEvents, tally } from './event-log.js';
import type { DiagnosticsMetrics, LoopMetrics, PlannerMetrics } from './types.js';

const NO_REASONS: Record<LoopEndReason, number> = {
  done: 0, max_iterations: 0, error: 0, aborted: 0,
};

const NO_RETRIES: Record<RetryKind, number> = {
  stream: 0, empty: 0, deterministic: 0, 'tool-correction': 0, 'intent-nudge': 0,
};

const NO_PLANNER_VIAS: Record<PlannerVia, number> = {
  heuristic: 0, llm: 0, cache: 0,
};

export function computeLoopMetrics(events: readonly ObservabilityEvent[]): LoopMetrics {
  const loopEnds = selectEvents(events, 'loop_end');
  const iterations = loopEnds.map(event => event.iterations);

  return {
    totalLoops: loopEnds.length,
    avgIterations: average(iterations),
    maxIterations: iterations.length === 0 ? null : Math.max(...iterations),
    reasons: tally(loopEnds, NO_REASONS, event => event.reason),
    retriesByKind: tally(selectEvents(events, 'retry'), NO_RETRIES, event => event.kind),
    iterationHistogram: countOccurrences(iterations, String),
  };
}

export function computePlannerMetrics(events: readonly ObservabilityEvent[]): PlannerMetrics {
  const decisions = selectEvents(events, 'planner_decision');
  const byVia = tally(decisions, NO_PLANNER_VIAS, event => event.via);
  const consulted = byVia.llm + byVia.cache;

  return {
    total: decisions.length,
    byVia,
    cacheHitRate: consulted === 0 ? null : byVia.cache / consulted,
  };
}

export function computeDiagnosticsMetrics(
  events: readonly ObservabilityEvent[],
): DiagnosticsMetrics {
  const runs = selectEvents(events, 'diagnostics');
  const clean = runs.filter(run => run.ok).length;

  return {
    total: runs.length,
    clean,
    problems: runs.length - clean,
    avgDurationMs: average(runs.map(run => run.durationMs)),
  };
}
