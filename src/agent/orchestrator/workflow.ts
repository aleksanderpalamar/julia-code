import { buildSharedContextSnapshot } from '../compactor.js';
import type { OrchestrationDeps, PlannedSubtask } from './types.js';
import { executeSubagents } from './subagent-runner.js';

export interface WorkflowResult {
  subtasks: PlannedSubtask[];
  resultLines: string[];
  completed: number;
  failed: number;
  allDone: boolean;
}

export async function executeOrchestrationWorkflow(input: {
  runId: string;
  subtasks: PlannedSubtask[];
  deps: OrchestrationDeps;
}): Promise<WorkflowResult> {
  const { runId, subtasks, deps } = input;
  const { sessionId, emit } = deps;

  const sharedContext = buildSharedContextSnapshot(sessionId);

  const { resultLines, completed, failed, allDone } = await executeSubagents({
    sessionId,
    runId,
    subtasks,
    sharedContext,
    emit,
  });

  return { subtasks, resultLines, completed, failed, allDone };
}
