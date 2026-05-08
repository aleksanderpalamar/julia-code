import type { ChatMessage } from '../../providers/types.js';
import type { ContextBudget } from '../../context/budget.js';
import type { ContextHealth } from '../../context/health.js';
import { buildContext } from '../context.js';
import { shouldEmergencyCompact, getEmergencyKeepCount } from '../../context/health.js';
import { performEmergencyCompaction } from '../compactor.js';

export interface ContextOptions {
  planMode: boolean;
  temperament: string;
  iteration: number;
  maxIterations: number;
  extraSystemContent?: string;
}

export interface PreparedContext {
  messages: ChatMessage[];
  budget: ContextBudget | null;
  health: ContextHealth;
}

export interface PreparationEmitter {
  compacting(): void;
  contextHealth(health: ContextHealth): void;
}

export async function prepareIterationContext(input: {
  sessionId: string;
  currentModel: string;
  auxModel: string;
  options: ContextOptions;
  emit: PreparationEmitter;
}): Promise<PreparedContext> {
  const { sessionId, currentModel, auxModel, options, emit } = input;

  const ctx = await buildContext(sessionId, currentModel, options);
  emit.contextHealth(ctx.health);

  if (!shouldEmergencyCompact(ctx.health)) {
    return { messages: ctx.messages, budget: ctx.budget, health: ctx.health };
  }

  emit.compacting();
  const keepCount = getEmergencyKeepCount(ctx.health);
  await performEmergencyCompaction(sessionId, auxModel, keepCount);
  const rebuilt = await buildContext(sessionId, currentModel, options);
  emit.contextHealth(rebuilt.health);
  return { messages: rebuilt.messages, budget: rebuilt.budget, health: rebuilt.health };
}
