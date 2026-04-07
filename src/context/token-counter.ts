import type { ChatMessage, ToolSchema } from '../providers/types.js';

const MESSAGE_OVERHEAD = 4;

const CHARS_PER_TOKEN = 3.5;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

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

export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  return total;
}

export function estimateToolSchemaTokens(tools: ToolSchema[]): number {
  if (tools.length === 0) return 0;
  const json = JSON.stringify(tools);
  return Math.ceil(json.length / CHARS_PER_TOKEN);
}

export function estimateDbMessageTokens(content: string, toolCalls?: string | null): number {
  let chars = content.length;
  if (toolCalls) chars += toolCalls.length;
  return Math.ceil(chars / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD;
}
