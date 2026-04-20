import { describe, it, expect } from 'vitest';
import { isLikelyComplex, analyzeComplexity } from '../src/agent/complexity.js';

describe('complexity heuristic / simple tasks', () => {
  it('classifies very short queries as simple', () => {
    expect(isLikelyComplex('liste os arquivos em src/')).toBe(false);
    expect(isLikelyComplex('what is the difference between let and const?')).toBe(false);
    expect(isLikelyComplex('hello')).toBe(false);
    expect(isLikelyComplex('')).toBe(false);
  });

  it('does not flag single-file edits as complex', () => {
    expect(isLikelyComplex('refatore o arquivo src/utils.ts para usar async/await')).toBe(false);
    expect(isLikelyComplex('crie um arquivo src/foo.ts com export const foo = 1')).toBe(false);
  });

  it('does not false-positive on the word "lista" (PT)', () => {
    expect(isLikelyComplex('lista os arquivos do diretório src/')).toBe(false);
  });

  it('does not false-positive on "e" appearing inside other words (PT)', () => {
    // "leia", "fecha", "pode" contain "e" but are not conjunctions.
    expect(isLikelyComplex('leia o arquivo foo.ts e me explique o que ele faz')).toBe(false);
  });

  it('does not flag conversational questions as complex', () => {
    expect(
      isLikelyComplex('você pode me explicar como funciona async/await em JavaScript?'),
    ).toBe(false);
    expect(
      isLikelyComplex('can you explain how async/await works in JavaScript?'),
    ).toBe(false);
  });
});

describe('complexity heuristic / complex tasks', () => {
  it('flags tasks with a numbered list of 3+ items', () => {
    const msg = `Preciso fazer o seguinte:
1. criar o endpoint GET /users
2. criar o endpoint POST /users
3. criar o endpoint DELETE /users`;
    expect(isLikelyComplex(msg)).toBe(true);
  });

  it('flags tasks with an INLINE numbered list of 3+ items (common in TUI single-line input)', () => {
    const msg =
      'preciso de três coisas: 1. criar src/foo.ts com export const a = 1, 2. criar src/bar.ts com export const b = 2 e 3. criar src/baz.ts com export const c = 3';
    expect(isLikelyComplex(msg)).toBe(true);
  });

  it('flags tasks with a bullet list of 3+ items', () => {
    const msg = `Tarefa:
- criar Header.tsx
- criar Footer.tsx
- criar Sidebar.tsx`;
    expect(isLikelyComplex(msg)).toBe(true);
  });

  it('flags long tasks with explicit batch keyword + action verb (PT)', () => {
    const msg =
      'Preciso que você refatore todos os arquivos dentro de src/components, convertendo class components em hooks. Faça isso para cada arquivo encontrado, mantendo a mesma API pública.';
    expect(isLikelyComplex(msg)).toBe(true);
  });

  it('flags long tasks with explicit batch keyword + action verb (EN)', () => {
    const msg =
      'Please refactor all the files inside src/components, converting every class component into hooks. Do this for each file found, keeping the same public API.';
    expect(isLikelyComplex(msg)).toBe(true);
  });

  it('flags long tasks with multiple action verbs and conjunctions', () => {
    const msg =
      'Crie um arquivo src/foo.ts com uma função foo e crie um arquivo src/bar.ts com uma função bar e implemente os testes para ambos em src/tests/foo-bar.test.ts e então atualize o README explicando o uso.';
    expect(isLikelyComplex(msg)).toBe(true);
  });
});

describe('complexity heuristic / signal inspection', () => {
  it('exposes the matched reason for debugging', () => {
    const result = analyzeComplexity(`Tarefa:
1. foo
2. bar
3. baz`);
    expect(result.complex).toBe(true);
    expect(result.signals.reason).toBe('numbered_list_3+');
  });

  it('returns too_short reason for trivial inputs', () => {
    const result = analyzeComplexity('oi');
    expect(result.complex).toBe(false);
    expect(result.signals.reason).toBe('too_short');
  });

  it('counts conjunctions with word-boundaries only', () => {
    // "pode" contains "e" — must NOT be counted.
    const result = analyzeComplexity('você pode me ajudar a entender esse código');
    expect(result.signals.conjunctions).toBe(0);
  });

  it('counts "e" correctly when it IS a conjunction', () => {
    const result = analyzeComplexity('leia o arquivo foo e o arquivo bar e explique');
    expect(result.signals.conjunctions).toBe(2);
  });
});
