import type { ObservabilityEvent } from '../events.js';
import { average, selectEvents, sumOf } from './event-log.js';
import type { MemoryRetrievalMetrics } from './types.js';

export function computeMemoryRetrievalMetrics(
  events: readonly ObservabilityEvent[],
): MemoryRetrievalMetrics {
  const retrievals = selectEvents(events, 'memory_retrieval');
  const available = retrievals.filter(event => event.providerAvailable).length;
  const scores = retrievals
    .map(event => event.topScore)
    .filter((score): score is number => score !== null);

  return {
    total: retrievals.length,
    providerAvailable: available,
    providerUnavailable: retrievals.length - available,
    availabilityRate: retrievals.length === 0 ? null : available / retrievals.length,
    candidates: sumOf(retrievals, event => event.candidates),
    returned: sumOf(retrievals, event => event.returned),
    avgTopScore: scores.length === 0
      ? null
      : scores.reduce((sum, score) => sum + score, 0) / scores.length,
    avgDurationMs: average(retrievals.map(event => event.durationMs)),
  };
}
