import type {
  CompactionKind,
  GateOutcomeKind,
  GateVia,
  LLMPass,
  LoopEndReason,
  PlannerVia,
  RetryKind,
} from '../events.js';

export interface OrchestrationMetrics {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  successRate: number;
  avgDurationMs: number | null;
  avgSubtaskCount: number | null;
}

export interface SubagentModelMetrics {
  count: number;
  completed: number;
  failed: number;
  avgDurationMs: number | null;
}

export interface SubagentMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  failureRate: number;
  avgDurationMs: number | null;
  perModel: Record<string, SubagentModelMetrics>;
}

export interface LoopMetrics {
  totalLoops: number;
  avgIterations: number | null;
  maxIterations: number | null;
  reasons: Record<LoopEndReason, number>;
  retriesByKind: Record<RetryKind, number>;
  iterationHistogram: Record<string, number>;
}

export interface ToolUsage {
  calls: number;
  failures: number;
  avgDurationMs: number | null;
}

export interface ToolMetrics {
  totalCalls: number;
  perTool: Record<string, ToolUsage>;
}

export interface GateMetrics {
  total: number;
  byOutcome: Record<GateOutcomeKind, number>;
  byVia: Record<GateVia, number>;
}

export interface PlannerMetrics {
  total: number;
  byVia: Record<PlannerVia, number>;
  cacheHitRate: number | null;
}

export interface DiagnosticsMetrics {
  total: number;
  clean: number;
  problems: number;
  avgDurationMs: number | null;
}

export interface ModelUsage {
  calls: number;
  avgDurationMs: number | null;
  tokens: number;
}

export interface LLMMetrics {
  totalCalls: number;
  byPass: Record<LLMPass, number>;
  avgDurationMs: number | null;
  promptTokens: number;
  completionTokens: number;
  perModel: Record<string, ModelUsage>;
}

export interface CompactionMetrics {
  total: number;
  byKind: Record<CompactionKind, number>;
  messagesCompacted: number;
  tokensSaved: number;
  avgDurationMs: number | null;
}

export interface AllMetrics {
  orchestration: OrchestrationMetrics;
  subagents: SubagentMetrics;
  loops: LoopMetrics;
  tools: ToolMetrics;
  planner: PlannerMetrics;
  diagnostics: DiagnosticsMetrics;
  llm: LLMMetrics;
  gate: GateMetrics;
  compaction: CompactionMetrics;
}
