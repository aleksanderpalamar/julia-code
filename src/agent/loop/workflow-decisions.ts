import { getConfig } from '../../config/index.js';
import { runOrchestration, type OrchestrationEventSink } from '../orchestrator/index.js';
import { maybeCompact, type CompactionOutcome } from '../compactor.js';

function shouldAutoOrchestrate(excludeTools?: string[]): boolean {
  const config = getConfig();
  return config.acpEnabled
    && config.acpAutoOrchestrate
    && !excludeTools?.includes('subagent');
}

export async function maybeAutoOrchestrate(input: {
  sessionId: string;
  turnId: string;
  userMessage: string;
  model: string;
  excludeTools?: string[];
  emit: OrchestrationEventSink;
}): Promise<boolean> {
  if (!shouldAutoOrchestrate(input.excludeTools)) return false;
  return await runOrchestration({
    sessionId: input.sessionId,
    turnId: input.turnId,
    userMessage: input.userMessage,
    model: input.model,
    emit: input.emit,
  });
}

export async function maybeRunCompaction(
  sessionId: string,
  auxModel: string,
  beforeCompact?: () => Promise<boolean>,
): Promise<CompactionOutcome> {
  return await maybeCompact(sessionId, auxModel, beforeCompact);
}
