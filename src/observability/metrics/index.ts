import { loadEvents } from './event-log.js';
import { computeOrchestrationMetrics, computeSubagentMetrics } from './run-metrics.js';
import { computeDiagnosticsMetrics, computeLoopMetrics, computePlannerMetrics } from './turn-metrics.js';
import { computeGateMetrics, computeToolMetrics } from './tool-metrics.js';
import { computeCompactionMetrics, computeLLMMetrics } from './model-metrics.js';
import { computeMemoryRetrievalMetrics } from './memory-metrics.js';
import { flushObservability } from '../event-sink.js';
import type { AllMetrics } from './types.js';

export async function getAllMetrics(): Promise<AllMetrics> {
  await flushObservability();
  const events = await loadEvents();

  return {
    orchestration: computeOrchestrationMetrics(),
    subagents: computeSubagentMetrics(),
    loops: computeLoopMetrics(events),
    tools: computeToolMetrics(events),
    planner: computePlannerMetrics(events),
    diagnostics: computeDiagnosticsMetrics(events),
    llm: computeLLMMetrics(events),
    gate: computeGateMetrics(events),
    compaction: computeCompactionMetrics(events),
    memory: computeMemoryRetrievalMetrics(events),
  };
}

export { loadEvents } from './event-log.js';
export { computeOrchestrationMetrics, computeSubagentMetrics } from './run-metrics.js';
export { computeDiagnosticsMetrics, computeLoopMetrics, computePlannerMetrics } from './turn-metrics.js';
export { computeGateMetrics, computeToolMetrics } from './tool-metrics.js';
export { computeCompactionMetrics, computeLLMMetrics } from './model-metrics.js';
export { computeMemoryRetrievalMetrics } from './memory-metrics.js';
export { formatMetricsForDisplay } from './report.js';
export type * from './types.js';
