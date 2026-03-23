import type { Message } from '../session/manager.js';
import { estimateDbMessageTokens } from './token-counter.js';

/**
 * Score a message by importance (0.0 to 1.0).
 * Higher score = more important = retained longer before compaction.
 */
export function scoreMessage(msg: Message, isFirstUserMessage: boolean): number {
  // First user message: always keep (task anchor source)
  if (isFirstUserMessage && msg.role === 'user') return 1.0;

  switch (msg.role) {
    case 'user':
      return 0.7;

    case 'assistant': {
      // Messages with tool calls are more important (action records)
      if (msg.tool_calls) return 0.6;
      return 0.4;
    }

    case 'tool': {
      // Score by tool type, extracted from the content wrapper
      const toolName = extractToolName(msg.content);
      switch (toolName) {
        case 'write':
        case 'edit':
          return 0.8; // Records what was changed — critical
        case 'exec':
          return 0.6; // Output may not be reproducible
        case 'read':
          return 0.5; // File can be re-read
        case 'grep':
        case 'glob':
          return 0.4; // Search results, can re-search
        case 'fetch':
          return 0.5; // External data
        default:
          return 0.5;
      }
    }

    case 'system':
      return 0.3; // System messages are rebuilt each iteration

    default:
      return 0.3;
  }
}

/**
 * Select which messages to keep vs compact based on priority and budget.
 * Always keeps the last `minRecentCount` messages regardless of score.
 * Among older messages, keeps highest-scored ones that fit within the token budget.
 */
export function selectMessagesForRetention(
  messages: Message[],
  budgetTokens: number,
  minRecentCount = 6,
): { toKeep: Message[]; toCompact: Message[] } {
  if (messages.length <= minRecentCount) {
    return { toKeep: messages, toCompact: [] };
  }

  // Always keep the most recent messages
  const recentMessages = messages.slice(-minRecentCount);
  const olderMessages = messages.slice(0, -minRecentCount);

  // Check if we're within budget with just recent messages
  let usedTokens = 0;
  for (const msg of recentMessages) {
    usedTokens += estimateDbMessageTokens(msg.content, msg.tool_calls);
  }

  if (usedTokens >= budgetTokens) {
    // Even recent messages exceed budget — compact everything older
    return { toKeep: recentMessages, toCompact: olderMessages };
  }

  // Score and sort older messages by priority
  const firstUserId = messages.find(m => m.role === 'user')?.id;
  const scored = olderMessages.map(msg => ({
    msg,
    score: scoreMessage(msg, msg.id === firstUserId),
    tokens: estimateDbMessageTokens(msg.content, msg.tool_calls),
  }));

  // Sort by score descending (highest priority first)
  scored.sort((a, b) => b.score - a.score);

  const remainingBudget = budgetTokens - usedTokens;
  const toKeep: Message[] = [];
  const toCompact: Message[] = [];
  let budgetUsed = 0;

  for (const item of scored) {
    if (budgetUsed + item.tokens <= remainingBudget && item.score >= 0.6) {
      toKeep.push(item.msg);
      budgetUsed += item.tokens;
    } else {
      toCompact.push(item.msg);
    }
  }

  // Re-sort kept older messages by ID (chronological order)
  toKeep.sort((a, b) => a.id - b.id);

  return {
    toKeep: [...toKeep, ...recentMessages],
    toCompact,
  };
}

/**
 * Extract tool name from wrapped tool result content.
 * Looks for: <tool_result tool="toolName" ...>
 */
function extractToolName(content: string): string | null {
  const match = content.match(/<tool_result\s+tool="(\w+)"/);
  return match ? match[1] : null;
}
