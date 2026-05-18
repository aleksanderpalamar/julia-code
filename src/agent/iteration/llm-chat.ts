import type { ChatMessage, ToolCall, ToolSchema, TokenUsage } from '../../providers/types.js';
import { getProvider } from '../../providers/registry.js';
import { addSessionTokens } from '../../session/manager.js';
import { log } from '../../observability/logger.js';

type LLMStreamOutcome =
  | { kind: 'ok'; fullText: string; toolCalls: ToolCall[] }
  | { kind: 'retry' }
  | { kind: 'error'; message: string };

interface LLMStreamEmitter {
  chunk(text: string): void;
  toolCall(tc: ToolCall): void;
  usage(usage: TokenUsage): void;
  clearStreaming(): void;
}

export async function streamLLMChat(input: {
  sessionId: string;
  iteration: number;
  model: string;
  messages: ChatMessage[];
  tools: ToolSchema[] | undefined;
  canRetryOnError: boolean;
  emit: LLMStreamEmitter;
  /** When true, text is accumulated but not streamed to the user — used for
   *  gather iterations on the routing model, whose prose is internal. */
  suppressText?: boolean;
}): Promise<LLMStreamOutcome> {
  const { sessionId, iteration, model, messages, tools, canRetryOnError, emit, suppressText } = input;

  const provider = getProvider('ollama');
  const stream = provider.chat({ model, messages, tools });

  let fullText = '';
  const toolCalls: ToolCall[] = [];

  for await (const chunk of stream) {
    switch (chunk.type) {
      case 'text':
        fullText += chunk.text!;
        if (!suppressText) emit.chunk(chunk.text!);
        break;
      case 'tool_call':
        toolCalls.push(chunk.toolCall!);
        emit.toolCall(chunk.toolCall!);
        break;
      case 'done':
        if (chunk.usage) {
          const total = chunk.usage.promptTokens + chunk.usage.completionTokens;
          addSessionTokens(sessionId, total);
          emit.usage(chunk.usage);
        }
        break;
      case 'error':
        if (canRetryOnError) {
          log.retry({ sessionId, iteration, kind: 'stream' });
          emit.clearStreaming();
          return { kind: 'retry' };
        }
        return { kind: 'error', message: chunk.error! };
    }
  }

  return { kind: 'ok', fullText, toolCalls };
}
