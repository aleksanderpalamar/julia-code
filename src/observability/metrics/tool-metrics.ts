import type { EventOf, GateOutcomeKind, GateVia, ObservabilityEvent } from '../events.js';
import { average, groupBy, mapValues, selectEvents, tally } from './event-log.js';
import type { GateMetrics, ToolMetrics, ToolUsage } from './types.js';

const NO_OUTCOMES: Record<GateOutcomeKind, number> = {
  allowed: 0, denied: 0, blocked: 0, approve_all: 0, rate_limited: 0,
};

const NO_VIAS: Record<GateVia, number> = {
  blocklist: 0, hook: 0, quota: 0, risk: 0, 'allow-rule': 0, user: 0,
};

function summarizeTool(calls: Array<EventOf<'tool_call'>>): ToolUsage {
  return {
    calls: calls.length,
    failures: calls.filter(call => !call.success).length,
    avgDurationMs: average(calls.map(call => call.durationMs)),
  };
}

export function computeToolMetrics(events: readonly ObservabilityEvent[]): ToolMetrics {
  const calls = selectEvents(events, 'tool_call');

  return {
    totalCalls: calls.length,
    perTool: mapValues(groupBy(calls, call => call.name), summarizeTool),
  };
}

export function computeGateMetrics(events: readonly ObservabilityEvent[]): GateMetrics {
  const decisions = selectEvents(events, 'gate_decision');

  return {
    total: decisions.length,
    byOutcome: tally(decisions, NO_OUTCOMES, decision => decision.outcome),
    byVia: tally(decisions, NO_VIAS, decision => decision.via),
  };
}
