import { describe, it, expect } from 'vitest';
import type { ChatChunk, ChatMessage, ToolCall, ToolSchema } from '../src/providers/types.js';
import { attemptCorrection, type ChatStreamFn } from '../src/agent/iteration/tool-correction.js';
import type { ArgError } from '../src/tools/validation.js';

const readToolSchema: ToolSchema = {
  type: 'function',
  function: {
    name: 'read',
    description: 'Read a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        offset: { type: 'number' },
      },
      required: ['path'],
    },
  },
};

const baseMessages: ChatMessage[] = [
  { role: 'user', content: 'read the config file' },
];

const badCall: ToolCall = {
  id: 'tc-1',
  function: { name: 'read', arguments: {} }, // missing required "path"
};

const missingPathErrors: ArgError[] = [
  { param: 'path', message: 'parameter "path" is required' },
];

interface ChatCall {
  model: string;
  messages: ChatMessage[];
  tools: ToolSchema[] | undefined;
}

/**
 * Builds a fake provider stream. `responses[n]` is what the nth call yields:
 * an args object becomes a `read` tool call, `null` becomes a text-only reply.
 * The last entry repeats for any further calls.
 */
function fakeChat(responses: Array<Record<string, unknown> | null>): {
  chat: ChatStreamFn;
  calls: ChatCall[];
} {
  const calls: ChatCall[] = [];
  let index = 0;
  const chat: ChatStreamFn = async function* (params) {
    calls.push({ model: params.model, messages: params.messages, tools: params.tools });
    const resp = responses[Math.min(index, responses.length - 1)];
    index++;
    if (resp !== null) {
      const chunk: ChatChunk = {
        type: 'tool_call',
        toolCall: { id: 'out', function: { name: 'read', arguments: resp } },
      };
      yield chunk;
    }
    yield { type: 'done' } as ChatChunk;
  };
  return { chat, calls };
}

describe('attemptCorrection', () => {
  it('corrects a malformed call on the first re-prompt', async () => {
    const { chat, calls } = fakeChat([{ path: 'src/config.ts' }]);

    const outcome = await attemptCorrection({
      toolCall: badCall,
      errors: missingPathErrors,
      toolSchema: readToolSchema,
      messages: baseMessages,
      model: 'small-model',
      maxAttempts: 2,
      chat,
    });

    expect(outcome).toEqual({ kind: 'corrected', args: { path: 'src/config.ts' } });
    expect(calls).toHaveLength(1);
  });

  it('coerces the arguments returned by the correction', async () => {
    const { chat } = fakeChat([{ path: 'x.ts', offset: '7' }]);

    const outcome = await attemptCorrection({
      toolCall: badCall,
      errors: missingPathErrors,
      toolSchema: readToolSchema,
      messages: baseMessages,
      model: 'small-model',
      maxAttempts: 2,
      chat,
    });

    expect(outcome.kind).toBe('corrected');
    if (outcome.kind === 'corrected') expect(outcome.args.offset).toBe(7);
  });

  it('fails after exhausting all attempts on a still-invalid call', async () => {
    const { chat, calls } = fakeChat([{}]); // always missing "path"

    const outcome = await attemptCorrection({
      toolCall: badCall,
      errors: missingPathErrors,
      toolSchema: readToolSchema,
      messages: baseMessages,
      model: 'small-model',
      maxAttempts: 2,
      chat,
    });

    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') expect(outcome.lastErrors[0].param).toBe('path');
    expect(calls).toHaveLength(2);
  });

  it('fails when the model emits no tool call', async () => {
    const { chat, calls } = fakeChat([null]);

    const outcome = await attemptCorrection({
      toolCall: badCall,
      errors: missingPathErrors,
      toolSchema: readToolSchema,
      messages: baseMessages,
      model: 'small-model',
      maxAttempts: 3,
      chat,
    });

    expect(outcome.kind).toBe('failed');
    expect(calls).toHaveLength(3);
  });

  it('does not call the provider when the signal is already aborted', async () => {
    const { chat, calls } = fakeChat([{ path: 'ok.ts' }]);
    const controller = new AbortController();
    controller.abort();

    const outcome = await attemptCorrection({
      toolCall: badCall,
      errors: missingPathErrors,
      toolSchema: readToolSchema,
      messages: baseMessages,
      model: 'small-model',
      maxAttempts: 2,
      chat,
      signal: controller.signal,
    });

    expect(outcome.kind).toBe('failed');
    expect(calls).toHaveLength(0);
  });

  it('re-prompts the correction model with only the offending tool', async () => {
    const { chat, calls } = fakeChat([{ path: 'src/config.ts' }]);

    await attemptCorrection({
      toolCall: badCall,
      errors: missingPathErrors,
      toolSchema: readToolSchema,
      messages: baseMessages,
      model: 'small-model',
      maxAttempts: 2,
      chat,
    });

    expect(calls[0].model).toBe('small-model');
    expect(calls[0].tools).toEqual([readToolSchema]);
    // base context preserved, correction re-prompt appended
    expect(calls[0].messages).toHaveLength(baseMessages.length + 1);
    const reprompt = calls[0].messages[calls[0].messages.length - 1];
    expect(reprompt.role).toBe('user');
    expect(reprompt.content).toContain('parameter "path" is required');
  });
});
