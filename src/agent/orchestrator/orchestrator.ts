import { randomUUID } from 'node:crypto';
import { maybeGenerateTitle } from '../title-generator.js';
import type { OrchestrationDeps, OrchestrationEventSink, OrchestrationProgress } from './types.js';
import { planSubtasks } from './planner.js';
import { executeOrchestrationWorkflow } from './workflow.js';
import { synthesizeFailureReport } from './synthesis.js';
import {
  recordOrchestrationStart,
  recordOrchestrationCompletion,
  recordAssistantMessage,
} from './persistence.js';
import {
  buildSpawnAnnouncement,
  buildCompletionSummary,
  buildResultsText,
  buildFinalOutput,
} from './report-builder.js';

export type { OrchestrationDeps, OrchestrationEventSink, OrchestrationProgress };

export async function runOrchestration(deps: OrchestrationDeps): Promise<boolean> {
  const { sessionId, userMessage, model, emit } = deps;

  const plan = await planSubtasks({ sessionId, userMessage, model });
  if (plan.kind === 'simple') return false;

  const runId = randomUUID();
  const start = Date.now();

  recordOrchestrationStart(runId, sessionId, userMessage, plan.subtasks.length);
  emit.chunk(buildSpawnAnnouncement(plan.subtasks.length, runId));

  const result = await executeOrchestrationWorkflow({ runId, subtasks: plan.subtasks, deps });

  recordOrchestrationCompletion(runId, result.allDone ? 'completed' : 'failed', Date.now() - start);
  emit.chunk(buildCompletionSummary(result.completed, result.failed));

  const synthesisText = result.failed > 0
    ? await synthesizeFailureReport({
      sessionId,
      userMessage,
      model,
      resultLines: result.resultLines,
      emit,
    })
    : '';

  const resultsText = buildResultsText(result.resultLines);
  const fullOutput = buildFinalOutput({
    subtaskCount: plan.subtasks.length,
    completed: result.completed,
    failed: result.failed,
    resultsText,
    synthesisText,
  });

  recordAssistantMessage(sessionId, fullOutput, model);
  emit.done(fullOutput);

  void maybeGenerateTitle(sessionId, model, userMessage, resultsText.slice(0, 500)).then(title => {
    if (title) emit.title(title);
  });

  return true;
}
