import type { TokenUsage } from '../../providers/types.js';

export interface OrchestrationProgress {
  runId: string;
  total: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
}

export interface OrchestrationEventSink {
  chunk(text: string): void;
  usage(usage: TokenUsage): void;
  done(fullText: string): void;
  title(title: string): void;
  subagentChunk(taskId: string, label: string, text: string): void;
  subagentStatus(taskId: string, label: string, status: string, durationMs?: number): void;
  progress(progress: OrchestrationProgress): void;
}

export interface OrchestrationDeps {
  sessionId: string;
  userMessage: string;
  model: string;
  emit: OrchestrationEventSink;
}

export interface PlannedSubtask {
  task: string;
  model?: string;
}
