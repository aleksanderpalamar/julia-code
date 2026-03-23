import { getContextLength } from './model-info.js';
import { estimateTokens } from './token-counter.js';

export interface ContextBudget {
  /** Model's total context window in tokens */
  total: number;
  /** Tokens reserved for completion output */
  reservedForOutput: number;
  /** Usable tokens: total - reservedForOutput */
  available: number;
  /** Budget for system prompt (measured at build time) */
  systemPrompt: number;
  /** Budget for task anchor section */
  taskAnchor: number;
  /** Budget for memories section */
  memories: number;
  /** Budget for compacted history summary */
  compactedHistory: number;
  /** Budget for recent (uncompacted) messages */
  recentMessages: number;
}

/**
 * Compute a context budget adapted to the model's context window size.
 *
 * @param model - Model name for Ollama
 * @param systemPromptText - The actual system prompt text to measure (optional, estimated if not provided)
 */
export async function computeBudget(model: string, systemPromptText?: string): Promise<ContextBudget> {
  const total = await getContextLength(model);

  // Reserve 15% for completion output, capped at 4096, floor at 512
  const reservedForOutput = Math.max(
    Math.min(Math.floor(total * 0.15), 4096),
    512, // minimum tokens for a useful response
  );
  const available = total - reservedForOutput;

  // System prompt: measured if provided, otherwise estimate ~2500 tokens
  const systemPrompt = systemPromptText
    ? estimateTokens(systemPromptText)
    : Math.min(2500, Math.floor(available * 0.25));

  // Task anchor: small fixed budget
  const taskAnchor = Math.min(500, Math.floor(available * 0.05));

  // Adapt percentages based on model size
  const { memoriesPct, compactedHistoryPct } = getModelSizeRatios(total);

  const memories = Math.min(Math.floor(available * memoriesPct), 1000);
  const compactedHistory = Math.floor(available * compactedHistoryPct);

  // Recent messages: everything left after other sections
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

/**
 * Compute the character cap for a single tool result based on the budget.
 */
export function computeToolResultCap(budget: ContextBudget, toolName: string): number {
  const baseTokens = budget.recentMessages;

  // Priority percentage per tool type
  let pct: number;
  switch (toolName) {
    case 'read':
    case 'edit':
    case 'write':
      pct = 0.40; // critical actions
      break;
    case 'exec':
      pct = 0.20; // verbose output
      break;
    case 'grep':
    case 'glob':
      pct = 0.25;
      break;
    default:
      pct = 0.25;
  }

  // Convert token budget to approximate char count
  const capChars = Math.floor(baseTokens * pct * 3.5);

  // Hard ceiling for safety
  return Math.min(capChars, 12000);
}

/**
 * Get budget allocation ratios based on model context window size.
 */
function getModelSizeRatios(contextLength: number): { memoriesPct: number; compactedHistoryPct: number } {
  if (contextLength <= 8192) {
    // Small models: minimize overhead, maximize recent messages
    return { memoriesPct: 0.03, compactedHistoryPct: 0.15 };
  }
  if (contextLength <= 32768) {
    // Medium models: balanced allocation
    return { memoriesPct: 0.05, compactedHistoryPct: 0.25 };
  }
  // Large models: more room for history
  return { memoriesPct: 0.05, compactedHistoryPct: 0.30 };
}
