import { describe, it, expect } from 'vitest';
import {
  stripTemplateLeakage,
  StreamingTemplateStripper,
} from '../src/providers/sanitize.js';

describe('stripTemplateLeakage', () => {
  it('strips <|...|> chat-template delimiters', () => {
    expect(stripTemplateLeakage('hello<|turn|> world')).toBe('hello world');
    expect(stripTemplateLeakage('a<|im_start|>b<|im_end|>c')).toBe('abc');
    expect(stripTemplateLeakage('<|tool_call_begin|>x<|tool_call_end|>')).toBe('x');
  });

  it('strips paired <think>...</think> blocks (including multiline)', () => {
    expect(stripTemplateLeakage('before<think>reasoning</think>after')).toBe(
      'beforeafter',
    );
    expect(
      stripTemplateLeakage('A<think>line1\nline2\nline3</think>B'),
    ).toBe('AB');
  });

  it('strips unmatched <think> or </think>', () => {
    expect(stripTemplateLeakage('abc</think>def')).toBe('abcdef');
    expect(stripTemplateLeakage('<think>xyz')).toBe('xyz');
  });

  it('strips <functions.X>...</functions.X> blocks (even with mismatched close name)', () => {
    expect(
      stripTemplateLeakage('pre<functions.subagent:3>{"a":1}</functions.subagent>post'),
    ).toBe('prepost');
    expect(
      stripTemplateLeakage('<functions.write>body</functions.write>'),
    ).toBe('');
  });

  it('keeps <tool_call>...</tool_call> blocks intact (fallback parser needs them)', () => {
    const input = 'before<tool_call>{"name":"write","arguments":{}}</tool_call>after';
    expect(stripTemplateLeakage(input)).toBe(input);
  });

  it('keeps <invoke>...</invoke> blocks intact (fallback parser needs them)', () => {
    const input = '<invoke name="write"><parameter name="path">a.ts</parameter></invoke>';
    expect(stripTemplateLeakage(input)).toBe(input);
  });

  it('keeps <parent_context>...</parent_context> intact (Fase 2.1)', () => {
    const input = '<parent_context>\n**Objetivo:** refactor\n</parent_context>\ntask';
    expect(stripTemplateLeakage(input)).toBe(input);
  });

  it('is a no-op on plain text', () => {
    const s = 'just some ordinary text with no template tokens.';
    expect(stripTemplateLeakage(s)).toBe(s);
  });

  it('handles a realistic gemma4 leak from a subagent', () => {
    const input =
      'Oi! Como posso ajudar você hoje?<|turn|>  <|turn>user do X<|turn|>' +
      '<functions.subagent:3>{"action":"spawn_many","tasks":["a","b"]}</functions.subagent>';
    const out = stripTemplateLeakage(input);
    expect(out).not.toContain('<|turn|>');
    expect(out).not.toContain('<functions.');
    expect(out).toContain('Oi! Como posso ajudar você hoje?');
  });
});

describe('StreamingTemplateStripper', () => {
  it('strips tokens that arrive in a single chunk', () => {
    const s = new StreamingTemplateStripper();
    expect(s.push('hello<|turn|>world') + s.flush()).toBe('helloworld');
  });

  it('strips tokens split across chunks', () => {
    const s = new StreamingTemplateStripper();
    let out = '';
    out += s.push('hello<|tu');
    out += s.push('rn|> world');
    out += s.flush();
    expect(out).toBe('hello world');
  });

  it('strips <think>...</think> split across many chunks', () => {
    const s = new StreamingTemplateStripper();
    let out = '';
    out += s.push('A<thi');
    out += s.push('nk>line');
    out += s.push('1\nline2</th');
    out += s.push('ink>B');
    out += s.flush();
    expect(out).toBe('AB');
  });

  it('passes through plain text unchanged', () => {
    const s = new StreamingTemplateStripper();
    let out = '';
    out += s.push('hello ');
    out += s.push('world ');
    out += s.push('again');
    out += s.flush();
    expect(out).toBe('hello world again');
  });

  it('never holds back more than MAX_HOLDBACK chars of pending text', () => {
    const s = new StreamingTemplateStripper();
    // Push a large chunk that ends with an open "<|" — the stripper must
    // not refuse to emit the large prefix while waiting for "|>".
    const prefix = 'x'.repeat(1000);
    const out = s.push(prefix + '<|partial');
    expect(out.length).toBeGreaterThan(900);
    expect(out).toContain('xxxx');
    // flush the held tail
    expect(s.flush()).toBe('<|partial');
  });

  it('keeps <tool_call> intact across chunks', () => {
    const s = new StreamingTemplateStripper();
    let out = '';
    out += s.push('<tool_call>{"name":"wr');
    out += s.push('ite","arguments":{}}</tool_call>');
    out += s.flush();
    expect(out).toBe('<tool_call>{"name":"write","arguments":{}}</tool_call>');
  });

  it('keeps <parent_context> intact across chunks', () => {
    const s = new StreamingTemplateStripper();
    let out = '';
    out += s.push('<parent_conte');
    out += s.push('xt>\ninfo\n</parent_');
    out += s.push('context>');
    out += s.flush();
    expect(out).toBe('<parent_context>\ninfo\n</parent_context>');
  });
});
