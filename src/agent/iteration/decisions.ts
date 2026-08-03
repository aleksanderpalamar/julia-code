import type { ToolCall } from '../../providers/types.js';
import { findAnnouncedToolIntent, needsToolCalling } from '../heuristics.js';
import type { ModelPlan } from '../model-selection.js';

export type PreMessageDecision =
  | { kind: 'switch-to-cloud'; newModel: string }
  | { kind: 'empty-retry' }
  | { kind: 'proceed' };

export function decidePreMessage(input: {
  fullText: string;
  toolCalls: ToolCall[];
  plan: ModelPlan;
  switchedToCloud: boolean;
  lastHadToolCalls: boolean;
  retryCount: number;
  useLocalFirst: boolean;
}): PreMessageDecision {
  const { fullText, toolCalls, plan, switchedToCloud, lastHadToolCalls, retryCount, useLocalFirst } = input;

  const localFailedTools = plan.localHasTools && plan.hasToolModel && !switchedToCloud
    && toolCalls.length === 0 && needsToolCalling(fullText);

  if ((useLocalFirst || localFailedTools) && toolCalls.length === 0 && needsToolCalling(fullText)) {
    return { kind: 'switch-to-cloud', newModel: plan.loopModel };
  }

  if (fullText === '' && toolCalls.length === 0 && lastHadToolCalls && retryCount < 1) {
    return { kind: 'empty-retry' };
  }

  return { kind: 'proceed' };
}

export type PostMessageDecision =
  | { kind: 'done' }
  | { kind: 'nudge-intent' }
  | { kind: 'done-with-warning' };

/**
 * Decision made AFTER the assistant message has been persisted but BEFORE the
 * loop reports the turn done. Triggers when the model announced a tool-flavored
 * action (`Vou ler X`, `let me check`…) yet emitted no `tool_call`. We give
 * the model exactly one chance to recover via a system nudge when iteration
 * budget remains; otherwise we surface a visible warning instead of failing
 * silently.
 */
export function decidePostMessage(input: {
  fullText: string;
  toolCalls: ToolCall[];
  intentNudgeUsed: boolean;
  skillExpectsTools: boolean;
  hasIterationBudget: boolean;
}): PostMessageDecision {
  const {
    fullText, toolCalls, intentNudgeUsed, skillExpectsTools, hasIterationBudget,
  } = input;

  if (toolCalls.length > 0) return { kind: 'done' };
  if (!skillExpectsTools) return { kind: 'done' };
  if (!findAnnouncedToolIntent(fullText)) return { kind: 'done' };

  return intentNudgeUsed || !hasIterationBudget
    ? { kind: 'done-with-warning' }
    : { kind: 'nudge-intent' };
}
