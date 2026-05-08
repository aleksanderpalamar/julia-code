import {
  addMessage,
  createOrchestrationRun,
  completeOrchestrationRun,
} from '../../session/manager.js';

export function recordOrchestrationStart(
  runId: string,
  sessionId: string,
  userMessage: string,
  subtaskCount: number,
): void {
  createOrchestrationRun(runId, sessionId, userMessage, subtaskCount);
}

export function recordOrchestrationCompletion(
  runId: string,
  status: 'completed' | 'failed',
  durationMs: number,
): void {
  completeOrchestrationRun(runId, status, durationMs);
}

export function recordAssistantMessage(
  sessionId: string,
  content: string,
  model: string,
): void {
  addMessage(sessionId, 'assistant', content, undefined, undefined, undefined, model);
}
