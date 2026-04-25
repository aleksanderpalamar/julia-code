import { randomUUID } from 'node:crypto';
import type { LLMProvider, ChatMessage, ChatChunk, ToolSchema, ToolCall } from './types.js';
import { getConfig } from '../config/index.js';
import { StreamingTemplateStripper, stripTemplateLeakage } from './sanitize.js';
import { parseFallbackToolCalls } from './tool-fallback.js';

export class OllamaProvider implements LLMProvider {
  name = 'ollama';

  async *chat(params: {
    model: string;
    messages: ChatMessage[];
    tools?: ToolSchema[];
  }): AsyncGenerator<ChatChunk> {
    const { ollamaHost } = getConfig();

    const body: Record<string, unknown> = {
      model: params.model,
      messages: params.messages.map(formatMessage),
      stream: true,
    };

    if (params.tools?.length) {
      body.tools = params.tools;
    }

    const maxRetries = 2;
    let res: Response | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      res = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok || res.status < 500) break;

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    if (!res!.ok) {
      yield { type: 'error', error: `Ollama error ${res!.status}: ${await res!.text()}` };
      return;
    }

    const reader = res!.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const accumulatedToolCalls: ToolCall[] = [];
    const textStripper = new StreamingTemplateStripper();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.trim()) continue;

        let chunk: OllamaChatResponse;
        try {
          chunk = JSON.parse(line);
        } catch {
          continue;
        }

        if (chunk.message?.tool_calls?.length) {
          for (const tc of chunk.message.tool_calls) {
            const toolCall: ToolCall = {
              id: randomUUID(),
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            };
            accumulatedToolCalls.push(toolCall);
            yield { type: 'tool_call', toolCall };
          }
        }

        if (chunk.message?.content) {
          fullText += chunk.message.content;
          const cleaned = textStripper.push(chunk.message.content);
          if (cleaned) yield { type: 'text', text: cleaned };
        }

        if (chunk.done) {
          const tail = textStripper.flush();
          if (tail) yield { type: 'text', text: tail };

          if (accumulatedToolCalls.length === 0 && params.tools?.length) {
            const fallbackCalls = parseFallbackToolCalls(stripTemplateLeakage(fullText));
            for (const tc of fallbackCalls) {
              accumulatedToolCalls.push(tc);
              yield { type: 'tool_call', toolCall: tc };
            }
          }

          yield {
            type: 'done',
            usage: {
              promptTokens: chunk.prompt_eval_count ?? 0,
              completionTokens: chunk.eval_count ?? 0,
            },
          };
          return;
        }
      }
    }

    yield { type: 'done' };
  }
}

function formatMessage(msg: ChatMessage): Record<string, unknown> {
  const formatted: Record<string, unknown> = {
    role: msg.role,
    content: msg.content,
  };

  if (msg.images?.length) {
    formatted.images = msg.images;
  }

  if (msg.tool_calls?.length) {
    formatted.tool_calls = msg.tool_calls.map(tc => ({
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));
  }

  return formatted;
}

export async function listOllamaModels(): Promise<string[]> {
  const { ollamaHost } = getConfig();
  try {
    const res = await fetch(`${ollamaHost}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json() as { models?: Array<{ name: string }> };
    return (data.models ?? []).map(m => m.name);
  } catch {
    return [];
  }
}

export async function listOllamaModelsDetailed(): Promise<import('./model-classifier.js').OllamaModelEntry[]> {
  const { ollamaHost } = getConfig();
  try {
    const res = await fetch(`${ollamaHost}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json() as { models?: import('./model-classifier.js').OllamaModelEntry[] };
    return data.models ?? [];
  } catch {
    return [];
  }
}

interface OllamaChatResponse {
  message?: {
    role: string;
    content?: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}
