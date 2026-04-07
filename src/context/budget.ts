import { getContextLength } from './model-info.js';
import { estimateTokens } from './token-counter.js';

export interface ContextBudget {
  total: number;
  reservedForOutput: number;
  available: number;
  systemPrompt: number;
  taskAnchor: number;
  memories: number;
  compactedHistory: number;
  recentMessages: number;
}

export async function computeBudget(model: string, systemPromptText?: string): Promise<ContextBudget> {
  const total = await getContextLength(model);

  const reservedForOutput = Math.max(
    Math.min(Math.floor(total * 0.15), 4096),
    512, // minimum tokens for a useful response
  );
  const available = total - reservedForOutput;

  const systemPrompt = systemPromptText
    ? estimateTokens(systemPromptText)
    : Math.min(2500, Math.floor(available * 0.25));

  const taskAnchor = Math.min(500, Math.floor(available * 0.05));

  const { memoriesPct, compactedHistoryPct } = getModelSizeRatios(total);

  const memories = Math.min(Math.floor(available * memoriesPct), 1000);
  const compactedHistory = Math.floor(available * compactedHistoryPct);

  const recentMessages = Math.max(
    available - systemPrompt - taskAnchor - memories - compactedHistory,
    Math.floor(available * 0.2), // minimum 20% guaranteed
  );

  return {
    total,
    reservedForOutput,
    available,
    systemPrompt,
    taskAnchor,
    memories,
    compactedHistory,
    recentMessages,
  };
}

export function computeToolResultCap(budget: ContextBudget, toolName: string): number {
  const baseTokens = budget.recentMessages;

  let pct: number;
  switch (toolName) {
    case 'read':
    case 'edit':
    case 'write':
      pct = 0.40;       break;
    case 'exec':
      pct = 0.20;       break;
    case 'grep':
    case 'glob':
      pct = 0.25;
      break;
    default:
      pct = 0.25;
  }

  const capChars = Math.floor(baseTokens * pct * 3.5);

  return Math.min(capChars, 12000);
}

function getModelSizeRatios(contextLength: number): { memoriesPct: number; compactedHistoryPct: number } {
  if (contextLength <= 8192) {
    return { memoriesPct: 0.03, compactedHistoryPct: 0.15 };
  }
  if (contextLength <= 32768) {
    return { memoriesPct: 0.05, compactedHistoryPct: 0.25 };
  }
  return { memoriesPct: 0.05, compactedHistoryPct: 0.30 };
}
