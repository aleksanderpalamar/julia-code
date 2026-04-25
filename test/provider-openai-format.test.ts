import { describe, it, expect } from 'vitest';
import {
  toOpenAIMessages,
  toOpenAITools,
  OpenAIStreamAccumulator,
  parseSSE,
} from '../src/providers/openai-format.js';
import type { ChatMessage, ToolSchema } from '../src/providers/types.js';

describe('toOpenAIMessages', () => {
  it('passes plain user/system/assistant messages through', () => {
    const input: ChatMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hey' },
    ];
    expect(toOpenAIMessages(input)).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hey' },
    ]);
  });

  it('serializes assistant tool_calls with stringified arguments', () => {
    const input: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'tc1', function: { name: 'read', arguments: { path: '/tmp/x' } } },
        ],
      },
    ];
    const out = toOpenAIMessages(input);
    expect(out[0].tool_calls).toEqual([
      {
        id: 'tc1',
        type: 'function',
        function: { name: 'read', arguments: '{"path":"/tmp/x"}' },
      },
    ]);
  });

  it('keeps already-string tool_call arguments as-is', () => {
    const input: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'tc1', function: { name: 'x', arguments: 'raw-string' as unknown as Record<string, unknown> } },
        ],
      },
    ];
    const out = toOpenAIMessages(input);
    expect(out[0].tool_calls?.[0].function.arguments).toBe('raw-string');
  });

  it('maps tool messages to {role:"tool", tool_call_id, content} when paired with an assistant tool_call', () => {
    const input: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tc1', function: { name: 'x', arguments: {} } }],
      },
      { role: 'tool', content: 'result', tool_call_id: 'tc1' },
    ];
    const out = toOpenAIMessages(input);
    expect(out[1]).toEqual({ role: 'tool', content: 'result', tool_call_id: 'tc1' });
  });

  it('handles missing tool_call_id with empty string', () => {
    const input: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: '', function: { name: 'x', arguments: {} } }],
      },
      { role: 'tool', content: 'r' },
    ];
    const out = toOpenAIMessages(input);
    // The assistant has tool_calls with empty id, so the tool message (also
    // empty id) gets dropped as orphan; we only expect the assistant.
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('assistant');
  });

  it('drops orphan tool messages whose assistant tool_call was compacted away', () => {
    const input: ChatMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'tool', content: 'stale result', tool_call_id: 'tc-gone' },
      { role: 'assistant', content: 'reply' },
    ];
    const out = toOpenAIMessages(input);
    expect(out.map(m => m.role)).toEqual(['user', 'assistant']);
  });

  it('keeps a tool message when its preceding assistant tool_call matches', () => {
    const input: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tc1', function: { name: 'read', arguments: { p: '/x' } } }],
      },
      { role: 'tool', content: 'file contents', tool_call_id: 'tc1' },
    ];
    const out = toOpenAIMessages(input);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ role: 'tool', content: 'file contents', tool_call_id: 'tc1' });
  });

  it('drops a tool message whose tool_call_id does not match the preceding assistant', () => {
    const input: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tc1', function: { name: 'read', arguments: {} } }],
      },
      { role: 'tool', content: 'wrong id', tool_call_id: 'tc-other' },
      { role: 'tool', content: 'right id', tool_call_id: 'tc1' },
    ];
    const out = toOpenAIMessages(input);
    expect(out.map(m => m.tool_call_id)).toEqual([undefined, 'tc1']);
  });

  it('converts empty assistant content to null when tool_calls are present', () => {
    const input: ChatMessage[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tc1', function: { name: 'x', arguments: {} } }],
      },
      { role: 'tool', content: 'r', tool_call_id: 'tc1' },
    ];
    const out = toOpenAIMessages(input);
    expect(out[0].content).toBeNull();
  });

  it('keeps non-empty assistant content as-is when tool_calls are present', () => {
    const input: ChatMessage[] = [
      {
        role: 'assistant',
        content: 'reasoning before the call',
        tool_calls: [{ id: 'tc1', function: { name: 'x', arguments: {} } }],
      },
      { role: 'tool', content: 'r', tool_call_id: 'tc1' },
    ];
    const out = toOpenAIMessages(input);
    expect(out[0].content).toBe('reasoning before the call');
  });

  it('keeps assistant content as empty string (not null) when there are no tool_calls', () => {
    const input: ChatMessage[] = [{ role: 'assistant', content: '' }];
    const out = toOpenAIMessages(input);
    expect(out[0].content).toBe('');
  });
});

describe('toOpenAITools', () => {
  it('passes tool schemas through as OpenAI tools', () => {
    const input: ToolSchema[] = [
      { type: 'function', function: { name: 'read', description: 'read a file', parameters: { type: 'object' } } },
    ];
    expect(toOpenAITools(input)).toEqual([
      { type: 'function', function: { name: 'read', description: 'read a file', parameters: { type: 'object' } } },
    ]);
  });
});

describe('OpenAIStreamAccumulator', () => {
  it('emits text chunks as they arrive', () => {
    const acc = new OpenAIStreamAccumulator();
    const out = acc.ingest({ choices: [{ delta: { content: 'hello' } }] });
    expect(out).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('accumulates fragmented tool_call arguments and emits on finish', () => {
    const acc = new OpenAIStreamAccumulator();
    expect(acc.ingest({
      choices: [{ delta: { tool_calls: [{ index: 0, id: 'tc1', function: { name: 'read', arguments: '{"pa' } }] } }],
    })).toEqual([]);
    expect(acc.ingest({
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"/tmp/x"}' } }] } }],
    })).toEqual([]);
    const finishOut = acc.ingest({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
    expect(finishOut).toHaveLength(1);
    expect(finishOut[0].type).toBe('tool_call');
    expect(finishOut[0].toolCall?.function.name).toBe('read');
    expect(finishOut[0].toolCall?.function.arguments).toEqual({ path: '/tmp/x' });
  });

  it('handles multiple parallel tool_calls keyed by index', () => {
    const acc = new OpenAIStreamAccumulator();
    acc.ingest({
      choices: [{
        delta: {
          tool_calls: [
            { index: 0, id: 'a', function: { name: 'read', arguments: '{}' } },
            { index: 1, id: 'b', function: { name: 'write', arguments: '{}' } },
          ],
        },
      }],
    });
    const out = acc.ingest({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
    expect(out).toHaveLength(2);
    expect(out.map(c => c.toolCall?.function.name)).toEqual(['read', 'write']);
  });

  it('falls back to empty args when arguments JSON is malformed', () => {
    const acc = new OpenAIStreamAccumulator();
    acc.ingest({
      choices: [{
        delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'read', arguments: 'not json' } }] },
      }],
    });
    const out = acc.ingest({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
    expect(out[0].toolCall?.function.arguments).toEqual({});
  });

  it('skips entries without a name during flush', () => {
    const acc = new OpenAIStreamAccumulator();
    acc.ingest({
      choices: [{
        delta: { tool_calls: [{ index: 0, id: 'x', function: { arguments: '{}' } }] },
      }],
    });
    const out = acc.ingest({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
    expect(out).toEqual([]);
  });

  it('hasEmittedToolCalls reflects state', () => {
    const acc = new OpenAIStreamAccumulator();
    expect(acc.hasEmittedToolCalls()).toBe(false);
    acc.ingest({
      choices: [{
        delta: { tool_calls: [{ index: 0, id: 'x', function: { name: 'r', arguments: '{}' } }] },
        finish_reason: 'tool_calls',
      }],
    });
    expect(acc.hasEmittedToolCalls()).toBe(true);
  });
});

describe('parseSSE', () => {
  function streamFromString(s: string): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode(s));
        controller.close();
      },
    });
  }

  function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    let i = 0;
    return new ReadableStream({
      pull(controller) {
        if (i >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(enc.encode(chunks[i++]));
      },
    });
  }

  it('parses well-formed SSE lines', async () => {
    const stream = streamFromString('data: {"a":1}\n\ndata: {"a":2}\n\n');
    const events: unknown[] = [];
    for await (const ev of parseSSE(stream)) events.push(ev);
    expect(events).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('stops at [DONE] sentinel', async () => {
    const stream = streamFromString('data: {"a":1}\n\ndata: [DONE]\n\ndata: {"a":2}\n\n');
    const events: unknown[] = [];
    for await (const ev of parseSSE(stream)) events.push(ev);
    expect(events).toEqual([{ a: 1 }]);
  });

  it('reassembles payloads split across chunks', async () => {
    const stream = streamFromChunks(['data: {"a":', '1}\n\ndata: ', '[DONE]\n\n']);
    const events: unknown[] = [];
    for await (const ev of parseSSE(stream)) events.push(ev);
    expect(events).toEqual([{ a: 1 }]);
  });

  it('skips malformed JSON without throwing', async () => {
    const stream = streamFromString('data: {bad\n\ndata: {"a":1}\n\n');
    const events: unknown[] = [];
    for await (const ev of parseSSE(stream)) events.push(ev);
    expect(events).toEqual([{ a: 1 }]);
  });

  it('handles CRLF line endings', async () => {
    const stream = streamFromString('data: {"a":1}\r\n\r\ndata: [DONE]\r\n\r\n');
    const events: unknown[] = [];
    for await (const ev of parseSSE(stream)) events.push(ev);
    expect(events).toEqual([{ a: 1 }]);
  });

  it('ignores non-data SSE lines', async () => {
    const stream = streamFromString('event: ping\n\ndata: {"a":1}\n\n');
    const events: unknown[] = [];
    for await (const ev of parseSSE(stream)) events.push(ev);
    expect(events).toEqual([{ a: 1 }]);
  });
});
