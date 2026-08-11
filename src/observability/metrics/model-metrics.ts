import type { EventOf, LLMPass, ObservabilityEvent } from '../events.js';
import { average, groupBy, mapValues, selectEvents, sumOf, tally } from './event-log.js';
import type { CompactionMetrics, LLMMetrics, ModelUsage } from './types.js';

const NO_PASSES: Record<LLMPass, number> = {
  main: 0, synthesis: 0, correction: 0,
};

const NO_COMPACTION_KINDS = { auto: 0, emergency: 0 };

function totalTokens(call: EventOf<'llm_call'>): number {
  return call.promptTokens + call.completionTokens;
}

function summarizeModel(calls: Array<EventOf<'llm_call'>>): ModelUsage {
  return {
    calls: calls.length,
    avgDurationMs: average(calls.map(call => call.durationMs)),
    tokens: sumOf(calls, totalTokens),
  };
}

export function computeLLMMetrics(events: readonly ObservabilityEvent[]): LLMMetrics {
  const calls = selectEvents(events, 'llm_call');

  return {
    totalCalls: calls.length,
    byPass: tally(calls, NO_PASSES, call => call.pass),
    avgDurationMs: average(calls.map(call => call.durationMs)),
    promptTokens: sumOf(calls, call => call.promptTokens),
    completionTokens: sumOf(calls, call => call.completionTokens),
    perModel: mapValues(groupBy(calls, call => call.model), summarizeModel),
  };
}

export function computeCompactionMetrics(
  events: readonly ObservabilityEvent[],
): CompactionMetrics {
  const runs = selectEvents(events, 'compaction');

  return {
    total: runs.length,
    byKind: tally(runs, NO_COMPACTION_KINDS, run => run.kind),
    messagesCompacted: sumOf(runs, run => run.messagesCompacted),
    tokensSaved: sumOf(runs, run => Math.max(0, run.tokensBefore - run.tokensAfter)),
    avgDurationMs: average(runs.map(run => run.durationMs)),
  };
}
