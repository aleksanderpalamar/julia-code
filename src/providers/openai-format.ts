import { randomUUID } from 'node:crypto';
import type { ChatChunk, ChatMessage, ToolCall, ToolSchema } from './types.js';

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export function toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
  const sanitized = sanitizeChatSequence(messages);
  return sanitized.map(toOpenAIMessage);
}

function sanitizeChatSequence(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const announcedIds = new Set<string>();

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        if (tc.id) announcedIds.add(tc.id);
      }
      out.push(msg);
      continue;
    }

    if (msg.role === 'tool') {
      const id = msg.tool_call_id;
      if (!id || !announcedIds.has(id)) {
        // Orphan tool result — its assistant counterpart was lost during
        // compaction or retention. Dropping it keeps the OpenAI-compat
        // validators on Hugging Face happy without losing other context.
        continue;
      }
      announcedIds.delete(id);
      out.push(msg);
      continue;
    }

    out.push(msg);
  }

  return out;
}

function toOpenAIMessage(msg: ChatMessage): OpenAIMessage {
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      content: msg.content,
      tool_call_id: msg.tool_call_id ?? '',
    };
  }

  const hasToolCalls = !!msg.tool_calls?.length;
  const content = msg.content ?? '';

  const out: OpenAIMessage = {
    role: msg.role,
    content: hasToolCalls && content.length === 0 ? null : content,
  };

  if (hasToolCalls) {
    out.tool_calls = msg.tool_calls!.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: typeof tc.function.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function.arguments ?? {}),
      },
    }));
  }

  return out;
}

export function toOpenAITools(tools: ToolSchema[]): OpenAITool[] {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));
}

interface PartialToolCall {
  id: string;
  name: string;
  argumentsBuffer: string;
}

export class OpenAIStreamAccumulator {
  private toolCallsByIndex = new Map<number, PartialToolCall>();
  private finishedToolCalls: ToolCall[] = [];

  ingest(json: unknown): ChatChunk[] {
    const out: ChatChunk[] = [];
    const choice = pickChoice(json);

    if (!choice) return out;

    const delta = (choice.delta ?? {}) as {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };

    if (typeof delta.content === 'string' && delta.content.length > 0) {
      out.push({ type: 'text', text: delta.content });
    }

    if (Array.isArray(delta.tool_calls)) {
      for (let i = 0; i < delta.tool_calls.length; i++) {
        const tc = delta.tool_calls[i];
        const idx = typeof tc.index === 'number' ? tc.index : i;
        const existing = this.toolCallsByIndex.get(idx);
        if (existing) {
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.argumentsBuffer += tc.function.arguments;
        } else {
          this.toolCallsByIndex.set(idx, {
            id: tc.id ?? randomUUID(),
            name: tc.function?.name ?? '',
            argumentsBuffer: tc.function?.arguments ?? '',
          });
        }
      }
    }

    if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
      const calls = this.flushToolCalls();
      for (const call of calls) {
        out.push({ type: 'tool_call', toolCall: call });
      }
    }

    return out;
  }

  flushToolCalls(): ToolCall[] {
    if (this.toolCallsByIndex.size === 0) return [];
    const indices = [...this.toolCallsByIndex.keys()].sort((a, b) => a - b);
    const calls: ToolCall[] = [];
    for (const idx of indices) {
      const partial = this.toolCallsByIndex.get(idx)!;
      if (!partial.name) continue;
      let args: Record<string, unknown> = {};
      if (partial.argumentsBuffer.trim().length > 0) {
        try {
          const parsed = JSON.parse(partial.argumentsBuffer);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch {
        }
      }
      calls.push({
        id: partial.id,
        function: { name: partial.name, arguments: args },
      });
    }
    this.toolCallsByIndex.clear();
    this.finishedToolCalls.push(...calls);
    return calls;
  }

  hasEmittedToolCalls(): boolean {
    return this.finishedToolCalls.length > 0 || this.toolCallsByIndex.size > 0;
  }
}

function pickChoice(json: unknown): { delta?: unknown; finish_reason?: string } | null {
  if (!json || typeof json !== 'object') return null;
  const choices = (json as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!first || typeof first !== 'object') return null;
  return first as { delta?: unknown; finish_reason?: string };
}

export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nlIdx: number;
      while ((nlIdx = buffer.indexOf('\n')) !== -1) {
        const rawLine = buffer.slice(0, nlIdx);
        buffer = buffer.slice(nlIdx + 1);
        const line = rawLine.replace(/\r$/, '').trim();
        if (!line) continue;
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          yield JSON.parse(payload);
        } catch {
        }
      }
    }

    const tail = buffer.replace(/\r$/, '').trim();
    if (tail.startsWith('data:')) {
      const payload = tail.slice(5).trim();
      if (payload && payload !== '[DONE]') {
        try {
          yield JSON.parse(payload);
        } catch {
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
