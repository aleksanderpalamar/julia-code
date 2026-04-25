import { describe, it, expect } from 'vitest';
import {
  parseFallbackToolCalls,
  parseToolCallJson,
  parseFunctionCallsXml,
} from '../src/providers/tool-fallback.js';

describe('parseToolCallJson', () => {
  it('parses a single <tool_call> JSON block', () => {
    const text = '<tool_call>{"name":"read","arguments":{"path":"/tmp/x"}}</tool_call>';
    const calls = parseToolCallJson(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('read');
    expect(calls[0].function.arguments).toEqual({ path: '/tmp/x' });
    expect(calls[0].id).toBeTruthy();
  });

  it('parses multiple tool calls in the same text', () => {
    const text = `
      <tool_call>{"name":"read","arguments":{"path":"a"}}</tool_call>
      <tool_call>{"name":"write","arguments":{"path":"b"}}</tool_call>
    `;
    const calls = parseToolCallJson(text);
    expect(calls.map(c => c.function.name)).toEqual(['read', 'write']);
  });

  it('accepts "args" as alias for "arguments"', () => {
    const text = '<tool_call>{"name":"grep","args":{"pattern":"foo"}}</tool_call>';
    const calls = parseToolCallJson(text);
    expect(calls[0].function.arguments).toEqual({ pattern: 'foo' });
  });

  it('skips malformed JSON without throwing', () => {
    const text = '<tool_call>{"name":"read", BROKEN }</tool_call>';
    expect(parseToolCallJson(text)).toEqual([]);
  });

  it('skips entries without a name', () => {
    const text = '<tool_call>{"arguments":{"path":"x"}}</tool_call>';
    expect(parseToolCallJson(text)).toEqual([]);
  });

  it('returns empty array when no tool_call tags present', () => {
    expect(parseToolCallJson('plain text response')).toEqual([]);
  });
});

describe('parseFunctionCallsXml', () => {
  it('parses a single <invoke> block with parameters', () => {
    const text = `
      <invoke name="read">
        <parameter name="path">/tmp/x</parameter>
      </invoke>
    `;
    const calls = parseFunctionCallsXml(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('read');
    expect(calls[0].function.arguments).toEqual({ path: '/tmp/x' });
  });

  it('trims parameter whitespace', () => {
    const text = '<invoke name="x"><parameter name="p">  hi  </parameter></invoke>';
    const calls = parseFunctionCallsXml(text);
    expect(calls[0].function.arguments).toEqual({ p: 'hi' });
  });

  it('parses multiple invokes with multiple parameters each', () => {
    const text = `
      <invoke name="a"><parameter name="x">1</parameter><parameter name="y">2</parameter></invoke>
      <invoke name="b"><parameter name="z">3</parameter></invoke>
    `;
    const calls = parseFunctionCallsXml(text);
    expect(calls).toHaveLength(2);
    expect(calls[0].function.arguments).toEqual({ x: '1', y: '2' });
    expect(calls[1].function.arguments).toEqual({ z: '3' });
  });

  it('returns empty array when no invoke tags present', () => {
    expect(parseFunctionCallsXml('text without invoke')).toEqual([]);
  });
});

describe('parseFallbackToolCalls', () => {
  it('prefers JSON parser when both formats appear', () => {
    const text = `
      <tool_call>{"name":"read","arguments":{}}</tool_call>
      <invoke name="write"><parameter name="p">x</parameter></invoke>
    `;
    const calls = parseFallbackToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('read');
  });

  it('falls back to XML when JSON not found', () => {
    const text = '<invoke name="grep"><parameter name="pattern">foo</parameter></invoke>';
    const calls = parseFallbackToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('grep');
  });

  it('returns empty when neither format present', () => {
    expect(parseFallbackToolCalls('plain text')).toEqual([]);
  });
});
