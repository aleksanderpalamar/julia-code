import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatChunk, ToolSchema } from '../src/providers/types.js';

const fetchMock = vi.fn();
const contextLengthMock = vi.fn(async () => 32_768);

vi.stubGlobal('fetch', fetchMock);

vi.mock('../src/config/index.js', () => ({
  getConfig: () => ({ ollamaHost: 'http://ollama.test' }),
}));

vi.mock('../src/context/model-info.js', () => ({
  getContextLength: (model: string) => contextLengthMock(model),
}));

import { OllamaProvider } from '../src/providers/ollama.js';

const memoryTool: ToolSchema = {
  type: 'function',
  function: {
    name: 'memory',
    description: 'Recall memory',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['recall'] },
        query: { type: 'string' },
      },
      required: ['action', 'query'],
    },
  },
};

beforeEach(() => {
  fetchMock.mockReset();
  contextLengthMock.mockClear();
});

describe('OllamaProvider raw tool calls', () => {
  it('promotes the exact Qwen memory JSON without streaming it as text', async () => {
    const qwenOutput = '{ "name": "memory", "arguments": { "action": "recall", "query": "who am i" } }';
    fetchMock.mockResolvedValue(ollamaResponse(qwenOutput));

    const chunks = await collect(new OllamaProvider().chat({
      model: 'qwen2.5-coder:7b',
      messages: [{ role: 'user', content: 'eu perguntei se você quem sou eu?' }],
      tools: [memoryTool],
    }));

    expect(chunks.filter(chunk => chunk.type === 'text')).toEqual([]);
    expect(chunks.find(chunk => chunk.type === 'tool_call')?.toolCall).toMatchObject({
      function: {
        name: 'memory',
        arguments: { action: 'recall', query: 'who am i' },
      },
    });
  });

  it.each([
    ['unknown tool', '{"name":"invented","arguments":{"action":"recall","query":"who am i"}}'],
    ['invalid arguments', '{"name":"memory","arguments":{"action":"delete","query":"who am i"}}'],
    ['missing arguments', '{"name":"memory","arguments":{"action":"recall"}}'],
    ['unknown argument', '{"name":"memory","arguments":{"action":"recall","query":"who am i","force":true}}'],
    ['unexpected envelope field', '{"name":"memory","arguments":{"action":"recall","query":"who am i"},"force":true}'],
    ['ordinary JSON', '{"answer":"Julia"}'],
  ])('keeps %s as inert text', async (_case, output) => {
    fetchMock.mockResolvedValue(ollamaResponse(output));

    const chunks = await collect(new OllamaProvider().chat({
      model: 'qwen2.5-coder:7b',
      messages: [{ role: 'user', content: 'test' }],
      tools: [memoryTool],
    }));

    expect(chunks.filter(chunk => chunk.type === 'tool_call')).toEqual([]);
    expect(chunks.filter(chunk => chunk.type === 'text').map(chunk => chunk.text).join('')).toBe(output);
  });

  it('sends the same context window used by the internal budget to Ollama', async () => {
    fetchMock.mockResolvedValue(ollamaResponse('Olá'));

    await collect(new OllamaProvider().chat({
      model: 'qwen2.5-coder:7b',
      messages: [{ role: 'user', content: 'Olá' }],
    }));

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(contextLengthMock).toHaveBeenCalledWith('qwen2.5-coder:7b');
    expect(body.options).toEqual({ num_ctx: 32_768 });
  });
});

function ollamaResponse(content: string): Response {
  return new Response(`${JSON.stringify({
    message: { role: 'assistant', content },
    done: true,
    prompt_eval_count: 128,
    eval_count: 32,
  })}\n`, { status: 200 });
}

async function collect(stream: AsyncGenerator<ChatChunk>): Promise<ChatChunk[]> {
  const chunks: ChatChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}
