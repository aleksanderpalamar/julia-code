import { findAnnouncedToolIntent } from '../heuristics.js';

const MAX_QUOTE_LEN = 160;

/**
 * Extracts the first sentence in `fullText` that announces a tool-flavored
 * action, suitable for quoting back to the model. Pure & deterministic.
 * Falls back to a trimmed prefix when no signal phrase is found, since the
 * caller has already decided this text counts as "promised but didn't act".
 */
export function extractIntentSnippet(fullText: string): string {
  const intent = findAnnouncedToolIntent(fullText);
  if (intent) {
    const sentenceStart = findSentenceStart(fullText, intent.index);
    const sentenceEnd = findSentenceEnd(fullText, intent.index);
    const snippet = fullText.slice(sentenceStart, sentenceEnd).trim();
    if (snippet) return truncate(snippet);
  }

  return truncate(fullText.trim());
}

/**
 * Builds the system message we inject after a turn where the model announced
 * a tool-flavored action but emitted no `tool_call`. Short, direct, and quotes
 * the offending sentence so the model sees exactly what we expected to happen.
 */
export function buildIntentNudge(fullText: string): string {
  const snippet = extractIntentSnippet(fullText);
  return [
    '[intent-without-action]',
    `Você disse "${snippet}" mas não emitiu nenhuma tool_call.`,
    'Se ainda quer realizar a ação, chame a ferramenta apropriada agora.',
    'Se não precisa de ferramentas para responder, responda diretamente sem prometer ações.',
  ].join(' ');
}

function isTerminator(text: string, i: number): boolean {
  const ch = text[i];
  if (ch === '\n') return true;
  if (ch !== '.' && ch !== '!' && ch !== '?') return false;
  const next = text[i + 1];
  return next === undefined || /\s/.test(next);
}

function findSentenceStart(text: string, idx: number): number {
  for (let i = idx - 1; i >= 0; i--) {
    if (isTerminator(text, i)) {
      let s = i + 1;
      while (s < text.length && (text[s] === ' ' || text[s] === '\t')) s++;
      return s;
    }
  }
  return 0;
}

function findSentenceEnd(text: string, idx: number): number {
  for (let i = idx; i < text.length; i++) {
    if (isTerminator(text, i)) return i + 1;
  }
  return text.length;
}

function truncate(s: string): string {
  return s.length > MAX_QUOTE_LEN ? `${s.slice(0, MAX_QUOTE_LEN)}…` : s;
}
