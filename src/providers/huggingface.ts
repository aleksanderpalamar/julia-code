import type { ChatChunk, ChatMessage, LLMProvider, ToolSchema } from './types.js';
import {
  OpenAIStreamAccumulator,
  parseSSE,
  toOpenAIMessages,
  toOpenAITools,
} from './openai-format.js';
import { StreamingTemplateStripper, stripTemplateLeakage } from './sanitize.js';
import { parseFallbackToolCalls } from './tool-fallback.js';

export interface HuggingFaceProviderOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export class HuggingFaceProvider implements LLMProvider {
  readonly name = 'huggingface';

  constructor(private opts: HuggingFaceProviderOptions) {}

  async *chat(params: {
    model: string;
    messages: ChatMessage[];
    tools?: ToolSchema[];
  }): AsyncGenerator<ChatChunk> {
    if (!this.opts.token) {
      yield {
        type: 'error',
        error: 'HuggingFace token ausente. Defina HF_TOKEN no ambiente ou models.huggingfaceToken em ~/.juliacode/settings.json.',
      };
      return;
    }

    const body: Record<string, unknown> = {
      model: params.model,
      messages: toOpenAIMessages(params.messages),
      stream: true,
    };

    if (params.tools?.length) {
      body.tools = toOpenAITools(params.tools);
    }

    const url = `${stripTrailingSlash(this.opts.baseUrl)}/v1/chat/completions`;
    const fetchFn = this.opts.fetchImpl ?? fetch;

    let res: Response;
    try {
      res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.opts.token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: 'error', error: `HuggingFace request falhou: ${msg}` };
      return;
    }

    if (!res.ok) {
      const text = await safeReadText(res);
      yield { type: 'error', error: translateHttpError(res.status, text) };
      return;
    }

    if (!res.body) {
      yield { type: 'error', error: 'HuggingFace retornou resposta sem corpo (stream vazio).' };
      return;
    }

    const accumulator = new OpenAIStreamAccumulator();
    const textStripper = new StreamingTemplateStripper();
    let fullText = '';
    let nativeToolCalls = 0;
    let usagePrompt = 0;
    let usageCompletion = 0;

    try {
      for await (const event of parseSSE(res.body)) {
        const usage = extractUsage(event);
        if (usage) {
          usagePrompt = usage.prompt_tokens ?? usagePrompt;
          usageCompletion = usage.completion_tokens ?? usageCompletion;
        }

        const chunks = accumulator.ingest(event);
        for (const chunk of chunks) {
          if (chunk.type === 'text' && chunk.text) {
            fullText += chunk.text;
            const cleaned = textStripper.push(chunk.text);
            if (cleaned) yield { type: 'text', text: cleaned };
          } else if (chunk.type === 'tool_call' && chunk.toolCall) {
            nativeToolCalls += 1;
            yield chunk;
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: 'error', error: `HuggingFace stream falhou: ${msg}` };
      return;
    }

    const tail = textStripper.flush();
    if (tail) {
      fullText += tail;
      yield { type: 'text', text: tail };
    }

    if (nativeToolCalls === 0 && params.tools?.length) {
      const fallback = parseFallbackToolCalls(stripTemplateLeakage(fullText));
      for (const tc of fallback) {
        yield { type: 'tool_call', toolCall: tc };
      }
    }

    yield {
      type: 'done',
      usage: { promptTokens: usagePrompt, completionTokens: usageCompletion },
    };
  }
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function translateHttpError(status: number, body: string): string {
  const trimmed = body.trim().slice(0, 500);
  switch (status) {
    case 401:
      return 'HuggingFace 401: token inválido ou ausente. Renove o HF_TOKEN.';
    case 403:
      return `HuggingFace 403: acesso negado ao modelo. ${trimmed}`;
    case 404:
      return `HuggingFace 404: modelo não encontrado. ${trimmed}`;
    case 402:
    case 429:
      return `HuggingFace ${status}: limite de uso atingido. ${trimmed}`;
    case 413:
      return 'HuggingFace 413: prompt longo demais para o modelo escolhido.';
    case 422:
      return `HuggingFace 422: payload rejeitado. ${trimmed}`;
    default:
      if (status >= 500) {
        return `HuggingFace ${status}: erro do servidor. ${trimmed}`;
      }
      return `HuggingFace ${status}: ${trimmed}`;
  }
}

function extractUsage(event: unknown): { prompt_tokens?: number; completion_tokens?: number } | null {
  if (!event || typeof event !== 'object') return null;
  const usage = (event as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return null;
  const u = usage as { prompt_tokens?: unknown; completion_tokens?: unknown };
  return {
    prompt_tokens: typeof u.prompt_tokens === 'number' ? u.prompt_tokens : undefined,
    completion_tokens: typeof u.completion_tokens === 'number' ? u.completion_tokens : undefined,
  };
}

