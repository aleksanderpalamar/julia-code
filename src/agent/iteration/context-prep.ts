import type { ChatMessage } from '../../providers/types.js';
import type { ContextBudget } from '../../context/budget.js';
import type { ContextHealth } from '../../context/health.js';
import { buildContext } from '../context.js';
import { shouldEmergencyCompact, getEmergencyKeepCount } from '../../context/health.js';
import { performEmergencyCompaction } from '../compactor.js';
import { recordEvent } from '../../observability/logger.js';

interface ContextOptions {
  planMode: boolean;
  temperament: string;
  iteration: number;
  maxIterations: number;
  extraSystemContent?: string;
  transientSystemContent?: string;
  transientAssistantContent?: string;
}

interface PreparedContext {
  messages: ChatMessage[];
  budget: ContextBudget | null;
  health: ContextHealth;
}

interface PreparationEmitter {
  compacting(): void;
  contextHealth(health: ContextHealth): void;
}

export async function prepareIterationContext(input: {
  sessionId: string;
  turnId: string;
  currentModel: string;
  auxModel: string;
  options: ContextOptions;
  emit: PreparationEmitter;
}): Promise<PreparedContext> {
  const { sessionId, turnId, currentModel, auxModel, options, emit } = input;

  const ctx = await buildContext(sessionId, currentModel, { ...options, turnId });
  emit.contextHealth(ctx.health);

  if (!shouldEmergencyCompact(ctx.health)) {
    return { messages: ctx.messages, budget: ctx.budget, health: ctx.health };
  }

  emit.compacting();
  const keepCount = getEmergencyKeepCount(ctx.health);
  const compaction = await performEmergencyCompaction(sessionId, auxModel, keepCount);
  if (compaction.performed) {
    recordEvent('compaction', {
      turnId,
      sessionId,
      kind: 'emergency',
      messagesCompacted: compaction.messagesCompacted,
      tokensBefore: compaction.tokensBefore,
      tokensAfter: compaction.tokensAfter,
      durationMs: compaction.durationMs,
    });
  }
  const rebuilt = await buildContext(sessionId, currentModel, { ...options, turnId });
  emit.contextHealth(rebuilt.health);
  return { messages: rebuilt.messages, budget: rebuilt.budget, health: rebuilt.health };
}
