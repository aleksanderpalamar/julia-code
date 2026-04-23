import { randomUUID } from 'node:crypto';
import { addMessage, createOrchestrationRun, completeOrchestrationRun } from '../../session/manager.js';
import { buildSharedContextSnapshot } from '../compactor.js';
import { maybeGenerateTitle } from '../title-generator.js';
import type { OrchestrationDeps, OrchestrationEventSink, OrchestrationProgress } from './types.js';
import { synthesizeFailureReport } from './synthesis.js';
import { planSubtasks } from './planner.js';
import { executeSubagents } from './subagent-runner.js';

export type { OrchestrationDeps, OrchestrationEventSink, OrchestrationProgress };

export async function runOrchestration(deps: OrchestrationDeps): Promise<boolean> {
  const { sessionId, userMessage, model, emit } = deps;

  const plan = await planSubtasks({ sessionId, userMessage, model });
  if (plan.kind === 'simple') return false;

  const { subtasks } = plan;
  const runId = randomUUID();
  const orchestrationStart = Date.now();

  createOrchestrationRun(runId, sessionId, userMessage, subtasks.length);
  emit.chunk(`🔀 Complex task detected - spawning ${subtasks.length} subagents... (run: ${runId.slice(0, 8)})\n\n`);

  const sharedContext = buildSharedContextSnapshot(sessionId);

  const { resultLines, completed, failed, allDone } = await executeSubagents({
    sessionId,
    runId,
    subtasks,
    sharedContext,
    emit,
  });

  completeOrchestrationRun(runId, allDone ? 'completed' : 'failed', Date.now() - orchestrationStart);

  emit.chunk(`\n✅ ${completed} completed, ${failed > 0 ? `❌ ${failed} failed` : 'no flaws'}\n\n`);

  const synthesisText = failed > 0
    ? await synthesizeFailureReport({ sessionId, userMessage, model, resultLines, emit })
    : '';

  const allResultsText = resultLines.filter(Boolean).join('\n\n---\n\n');
  const fullOutput = `🔀 ${subtasks.length} executed subagents (${completed} ok, ${failed} failed)\n\n${allResultsText}${synthesisText ? '\n\n' + synthesisText : ''}`;
  addMessage(sessionId, 'assistant', fullOutput, undefined, undefined, undefined, model);
  emit.done(fullOutput);
  void maybeGenerateTitle(sessionId, model, userMessage, allResultsText.slice(0, 500)).then(title => {
    if (title) emit.title(title);
  });
  return true;
}
