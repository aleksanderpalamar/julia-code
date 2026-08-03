import { describe, it, expect } from 'vitest';
import { extractIntentSnippet, buildIntentNudge } from '../src/agent/iteration/intent-nudge.js';

describe('extractIntentSnippet', () => {
  it('returns the sentence containing the announcement', () => {
    const text = 'Vou começar a análise técnica. Primeiro, vou ler o package.json para entender as dependências. Depois vou estruturar.';
    expect(extractIntentSnippet(text)).toBe('Primeiro, vou ler o package.json para entender as dependências.');
  });

  it('handles English intent phrases', () => {
    const text = "Sure, here's the plan. Let me check the README first. Then I will summarize.";
    expect(extractIntentSnippet(text)).toBe('Let me check the README first.');
  });

  it('uses newly recognized phrases from the shared matcher', () => {
    const text = 'Contexto inicial. Agora vou inspecionar o loop principal. Depois respondo.';
    expect(extractIntentSnippet(text)).toBe('Agora vou inspecionar o loop principal.');
  });

  it('stops at newline when there is no terminal punctuation', () => {
    const text = 'Plano:\nVou listar os arquivos da pasta src\nE depois vou abrir cada um.';
    expect(extractIntentSnippet(text)).toBe('Vou listar os arquivos da pasta src');
  });

  it('truncates long sentences with an ellipsis', () => {
    const text = `Vou rodar ${'x'.repeat(300)}.`;
    const snippet = extractIntentSnippet(text);
    expect(snippet.length).toBeLessThanOrEqual(161);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('falls back to the trimmed text when no intent phrase matches', () => {
    const text = '   pong   ';
    expect(extractIntentSnippet(text)).toBe('pong');
  });
});

describe('buildIntentNudge', () => {
  it('produces a single-line system message tagged with [intent-without-action]', () => {
    const nudge = buildIntentNudge('Vou ler o package.json agora.');
    expect(nudge).toContain('[intent-without-action]');
    expect(nudge).toContain('"Vou ler o package.json agora."');
    expect(nudge).toContain('chame a ferramenta apropriada');
    expect(nudge.split('\n').length).toBe(1);
  });
});
