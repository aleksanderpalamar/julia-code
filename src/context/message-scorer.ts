import type { Message } from '../session/manager.js';
import { estimateDbMessageTokens } from './token-counter.js';

export function scoreMessage(msg: Message, isFirstUserMessage: boolean): number {
  if (isFirstUserMessage && msg.role === 'user') return 1.0;

  switch (msg.role) {
    case 'user':
      return 0.7;

    case 'assistant': {
      if (msg.tool_calls) return 0.6;
      return 0.4;
    }

    case 'tool': {
      const toolName = extractToolName(msg.content);
      switch (toolName) {
        case 'write':
        case 'edit':
          return 0.8;         case 'exec':
          return 0.6;         case 'read':
          return 0.5;         case 'grep':
        case 'glob':
          return 0.4;         case 'fetch':
          return 0.5;         default:
          return 0.5;
      }
    }

    case 'system':
      return 0.3; 
    default:
      return 0.3;
  }
}

export function selectMessagesForRetention(
  messages: Message[],
  budgetTokens: number,
  minRecentCount = 6,
): { toKeep: Message[]; toCompact: Message[] } {
  if (messages.length <= minRecentCount) {
    return { toKeep: messages, toCompact: [] };
  }

  const recentMessages = messages.slice(-minRecentCount);
  const olderMessages = messages.slice(0, -minRecentCount);

  let usedTokens = 0;
  for (const msg of recentMessages) {
    usedTokens += estimateDbMessageTokens(msg.content, msg.tool_calls);
  }

  if (usedTokens >= budgetTokens) {
    return { toKeep: recentMessages, toCompact: olderMessages };
  }

  const firstUserId = messages.find(m => m.role === 'user')?.id;
  const scored = olderMessages.map(msg => ({
    msg,
    score: scoreMessage(msg, msg.id === firstUserId),
    tokens: estimateDbMessageTokens(msg.content, msg.tool_calls),
  }));

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

  toKeep.sort((a, b) => a.id - b.id);

  return {
    toKeep: [...toKeep, ...recentMessages],
    toCompact,
  };
}

function extractToolName(content: string): string | null {
  const match = content.match(/<tool_result\s+tool="(\w+)"/);
  return match ? match[1] : null;
}
