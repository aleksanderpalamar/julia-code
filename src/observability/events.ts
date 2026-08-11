export type PlannerVia = 'heuristic' | 'llm' | 'cache';
export type LLMPass = 'main' | 'synthesis' | 'correction';
export type GateOutcomeKind = 'allowed' | 'denied' | 'blocked' | 'approve_all' | 'rate_limited';
export type GateVia = 'blocklist' | 'hook' | 'quota' | 'risk' | 'allow-rule' | 'user';
export type RetryKind = 'stream' | 'empty' | 'deterministic' | 'tool-correction' | 'intent-nudge';
export type LoopEndReason = 'done' | 'max_iterations' | 'error' | 'aborted';
export type CompactionKind = 'auto' | 'emergency';
export type SubagentStatus = 'completed' | 'failed';

interface TurnScoped {
  turnId: string;
  sessionId: string;
}

interface IterationScoped extends TurnScoped {
  iteration: number;
}

export interface EventPayloads {
  planner_decision: TurnScoped & {
    complex: boolean;
    subtaskCount: number;
    via: PlannerVia;
    durationMs: number;
    taskPreview: string;
  };
  subagent_spawn: TurnScoped & {
    runId: string;
    taskId: string;
    model: string | undefined;
    taskPreview: string;
  };
  subagent_done: TurnScoped & {
    runId: string;
    taskId: string;
    status: SubagentStatus;
    durationMs: number | undefined;
    error?: string;
  };
  tool_call: IterationScoped & {
    name: string;
    success: boolean;
    durationMs: number;
  };
  retry: IterationScoped & {
    kind: RetryKind;
  };
  diagnostics: IterationScoped & {
    ok: boolean;
    durationMs: number;
  };
  llm_call: IterationScoped & {
    model: string;
    pass: LLMPass;
    durationMs: number;
    promptTokens: number;
    completionTokens: number;
    toolCallCount: number;
  };
  gate_decision: IterationScoped & {
    toolName: string;
    outcome: GateOutcomeKind;
    via: GateVia;
  };
  compaction: TurnScoped & {
    kind: CompactionKind;
    messagesCompacted: number;
    tokensBefore: number;
    tokensAfter: number;
    durationMs: number;
  };
  memory_retrieval: TurnScoped & {
    candidates: number;
    returned: number;
    topScore: number | null;
    durationMs: number;
    providerAvailable: boolean;
  };
  loop_end: TurnScoped & {
    iterations: number;
    reason: LoopEndReason;
    tokensUsed?: number;
  };
}

export type ObservabilityEventType = keyof EventPayloads;

export type EventPayload<T extends ObservabilityEventType> = EventPayloads[T];

export type ObservabilityEvent = {
  [T in ObservabilityEventType]: { type: T; ts: string } & EventPayloads[T];
}[ObservabilityEventType];

export type EventOf<T extends ObservabilityEventType> = Extract<ObservabilityEvent, { type: T }>;
