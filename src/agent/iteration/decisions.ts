import type { ToolCall } from '../../providers/types.js';
import { needsToolCalling } from '../heuristics.js';
import type { ModelPlan } from '../model-selection.js';

type PreMessageDecision =
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
