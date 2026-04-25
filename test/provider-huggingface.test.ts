import { describe, it, expect, vi } from 'vitest';
import { HuggingFaceProvider } from '../src/providers/huggingface.js';
import type { ChatChunk, ChatMessage, ToolSchema } from '../src/providers/types.js';

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= events.length) {
        controller.close();
        return;
      }
      controller.enqueue(enc.encode(events[i++]));
    },
  });
}

function makeFetch(response: { status?: number; ok?: boolean; body?: ReadableStream<Uint8Array> | null; text?: string }) {
  return vi.fn(async () => {
    const status = response.status ?? 200;
    return {
      ok: response.ok ?? status < 400,
      status,
      body: response.body ?? null,
      async text() {
        return response.text ?? '';
      },
    } as unknown as Response;
  });
}

async function collect(gen: AsyncGenerator<ChatChunk>): Promise<ChatChunk[]> {
  const out: ChatChunk[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

const messages: ChatMessage[] = [{ role: 'user', content: 'oi' }];

describe('HuggingFaceProvider', () => {
  it('errors out cleanly when token is missing', async () => {
    const provider = new HuggingFaceProvider({ baseUrl: 'https://router.huggingface.co', token: '' });
    const chunks = await collect(provider.chat({ model: 'm', messages }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe('error');
    expect(chunks[0].error).toMatch(/token ausente/i);
  });

  it('streams text deltas from a well-formed SSE response', async () => {
    const stream = sseStream([
      'data: {"choices":[{"delta":{"content":"hello "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ]);
    const fetchImpl = makeFetch({ body: stream });
    const provider = new HuggingFaceProvider({
      baseUrl: 'https://router.huggingface.co',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const chunks = await collect(provider.chat({ model: 'm', messages }));
    const texts = chunks.filter(c => c.type === 'text').map(c => c.text);
    const done = chunks.find(c => c.type === 'done');
    expect(texts.join('')).toBe('hello world');
    expect(done?.usage).toEqual({ promptTokens: 3, completionTokens: 2 });
  });

  it('emits native tool_call when the model returns OpenAI tool_calls', async () => {
    const stream = sseStream([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc1","function":{"name":"read","arguments":"{\\"path\\":\\"/x\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const fetchImpl = makeFetch({ body: stream });
    const provider = new HuggingFaceProvider({
      baseUrl: 'https://router.huggingface.co',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const tools: ToolSchema[] = [
      { type: 'function', function: { name: 'read', description: 'r', parameters: {} } },
    ];
    const chunks = await collect(provider.chat({ model: 'm', messages, tools }));
    const toolCallChunks = chunks.filter(c => c.type === 'tool_call');
    expect(toolCallChunks).toHaveLength(1);
    expect(toolCallChunks[0].toolCall?.function.name).toBe('read');
    expect(toolCallChunks[0].toolCall?.function.arguments).toEqual({ path: '/x' });
  });

  it('falls back to XML/JSON parsing when no native tool_calls were emitted', async () => {
    const stream = sseStream([
      'data: {"choices":[{"delta":{"content":"<tool_call>{\\"name\\":\\"read\\",\\"arguments\\":{\\"path\\":\\"/x\\"}}</tool_call>"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const fetchImpl = makeFetch({ body: stream });
    const provider = new HuggingFaceProvider({
      baseUrl: 'https://router.huggingface.co',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const tools: ToolSchema[] = [
      { type: 'function', function: { name: 'read', description: 'r', parameters: {} } },
    ];
    const chunks = await collect(provider.chat({ model: 'm', messages, tools }));
    const toolCalls = chunks.filter(c => c.type === 'tool_call');
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].toolCall?.function.name).toBe('read');
    expect(toolCalls[0].toolCall?.function.arguments).toEqual({ path: '/x' });
  });

  it('does not run fallback parser when no tools were requested', async () => {
    const stream = sseStream([
      'data: {"choices":[{"delta":{"content":"<tool_call>{\\"name\\":\\"x\\",\\"arguments\\":{}}</tool_call>"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const fetchImpl = makeFetch({ body: stream });
    const provider = new HuggingFaceProvider({
      baseUrl: 'https://router.huggingface.co',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const chunks = await collect(provider.chat({ model: 'm', messages }));
    expect(chunks.filter(c => c.type === 'tool_call')).toHaveLength(0);
  });

  it('translates 401 into a clear error message', async () => {
    const fetchImpl = makeFetch({ status: 401, text: 'unauthorized' });
    const provider = new HuggingFaceProvider({
      baseUrl: 'https://router.huggingface.co',
      token: 'bad',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const chunks = await collect(provider.chat({ model: 'm', messages }));
    expect(chunks[0].type).toBe('error');
    expect(chunks[0].error).toMatch(/401/);
    expect(chunks[0].error).toMatch(/token/i);
  });

  it('translates 429 into a rate-limit message', async () => {
    const fetchImpl = makeFetch({ status: 429, text: 'too many' });
    const provider = new HuggingFaceProvider({
      baseUrl: 'https://router.huggingface.co',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const chunks = await collect(provider.chat({ model: 'm', messages }));
    expect(chunks[0].error).toMatch(/limite/i);
  });

  it('translates 413 into a clear payload-too-large message', async () => {
    const fetchImpl = makeFetch({ status: 413 });
    const provider = new HuggingFaceProvider({
      baseUrl: 'https://router.huggingface.co',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const chunks = await collect(provider.chat({ model: 'm', messages }));
    expect(chunks[0].error).toMatch(/longo demais/i);
  });

  it('treats network errors as a structured ChatChunk error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const provider = new HuggingFaceProvider({
      baseUrl: 'https://router.huggingface.co',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const chunks = await collect(provider.chat({ model: 'm', messages }));
    expect(chunks[0].type).toBe('error');
    expect(chunks[0].error).toMatch(/ECONNREFUSED/);
  });

  it('sends Authorization header and serialized tool_calls in messages', async () => {
    const stream = sseStream([
      'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ]);
    const fetchImpl = makeFetch({ body: stream });
    const provider = new HuggingFaceProvider({
      baseUrl: 'https://router.huggingface.co',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const messagesWithToolCalls: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tc1', function: { name: 'read', arguments: { path: '/x' } } }],
      },
      { role: 'tool', content: 'result', tool_call_id: 'tc1' },
    ];
    await collect(provider.chat({ model: 'm', messages: messagesWithToolCalls }));
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://router.huggingface.co/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tok',
    });
    const body = JSON.parse(((init as RequestInit).body) as string);
    expect(body.stream).toBe(true);
    expect(body.messages[0].tool_calls[0].function.arguments).toBe('{"path":"/x"}');
    expect(body.messages[1]).toEqual({ role: 'tool', tool_call_id: 'tc1', content: 'result' });
  });
});
