import { getConfig } from '../../config/index.js';
import { runOrchestration, type OrchestrationEventSink } from '../orchestrator/index.js';
import { maybeCompact, type CompactionOutcome } from '../compactor.js';
import type { QuotaGuard } from '../../security/rate-limit.js';

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
  quotas?: QuotaGuard;
  emit: OrchestrationEventSink;
}): Promise<boolean> {
  if (!shouldAutoOrchestrate(input.excludeTools)) return false;
  return await runOrchestration({
    sessionId: input.sessionId,
    turnId: input.turnId,
    userMessage: input.userMessage,
    model: input.model,
    quotas: input.quotas,
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
