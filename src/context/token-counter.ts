import type { ChatMessage, ToolSchema } from '../providers/types.js';

/**
 * Per-message overhead in tokens: role marker, delimiters, etc.
 * Standard for chat-ML format used by most models.
 */
const MESSAGE_OVERHEAD = 4;

/**
 * Conservative chars-to-tokens ratio.
 * 3.5 is more accurate than 4 for mixed code/text content.
 */
const CHARS_PER_TOKEN = 3.5;

/**
 * Estimate token count for a string.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate token count for a single ChatMessage including overhead.
 */
export function estimateMessageTokens(msg: ChatMessage): number {
  let chars = msg.content.length;

  if (msg.tool_calls) {
    chars += JSON.stringify(msg.tool_calls).length;
  }

  if (msg.tool_call_id) {
    chars += msg.tool_call_id.length;
  }

  return Math.ceil(chars / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD;
}

/**
 * Estimate total token count for an array of ChatMessages.
 */
export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  return total;
}

/**
 * Estimate tokens consumed by tool schema definitions.
 * Tool schemas are serialized as JSON in the API request.
 */
export function estimateToolSchemaTokens(tools: ToolSchema[]): number {
  if (tools.length === 0) return 0;
  const json = JSON.stringify(tools);
  return Math.ceil(json.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens from raw DB message fields (avoids creating ChatMessage objects).
 */
export function estimateDbMessageTokens(content: string, toolCalls?: string | null): number {
  let chars = content.length;
  if (toolCalls) chars += toolCalls.length;
  return Math.ceil(chars / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD;
}
