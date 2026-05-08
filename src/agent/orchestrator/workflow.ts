import { buildSharedContextSnapshot } from '../compactor.js';
import type { OrchestrationDeps, PlannedSubtask } from './types.js';
import { synthesizeFailureReport } from './synthesis.js';
import { executeSubagents } from './subagent-runner.js';

export interface WorkflowResult {
  subtasks: PlannedSubtask[];
  resultLines: string[];
  completed: number;
  failed: number;
  allDone: boolean;
  synthesisText: string;
}

export async function executeOrchestrationWorkflow(input: {
  runId: string;
  subtasks: PlannedSubtask[];
  deps: OrchestrationDeps;
}): Promise<WorkflowResult> {
  const { runId, subtasks, deps } = input;
  const { sessionId, userMessage, model, emit } = deps;

  const sharedContext = buildSharedContextSnapshot(sessionId);

  const { resultLines, completed, failed, allDone } = await executeSubagents({
    sessionId,
    runId,
    subtasks,
    sharedContext,
    emit,
  });

  const synthesisText = failed > 0
    ? await synthesizeFailureReport({ sessionId, userMessage, model, resultLines, emit })
    : '';

  return { subtasks, resultLines, completed, failed, allDone, synthesisText };
}
