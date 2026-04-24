import type { GatingDecision } from './types.js';

export interface GatingConfig {
  customGate?: (input: string) => GatingDecision | null | undefined;
}

const PURE_GREETING = /^(?:oi|ola|olá|e\s*a[ií]|hello|hi|hey|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem)[\s!?.,]*$/i;

const STOPWORDS = new Set([
  'a', 'o', 'as', 'um', 'uma', 'uns', 'umas',
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'e', 'ou', 'mas', 'que', 'se', 'por', 'para', 'com', 'sem',
  'eu', 'tu', 'ele', 'ela', 'voce', 'você', 'nós', 'eles', 'elas',
  'meu', 'minha', 'teu', 'tua', 'seu', 'sua',
  'the', 'an', 'of', 'in', 'on', 'at', 'is', 'are', 'was', 'were',
  'i', 'me', 'my', 'you', 'your', 'it', 'its', 'to', 'from', 'and', 'or', 'but',
  'tudo', 'bem', 'ai', 'aí', 'hoje', 'agora',
]);

const SIGNIFICANT_TOKEN_MIN = 2;

export function decideGating(input: string, config: GatingConfig = {}): GatingDecision {
  const trimmed = input.trim();

  if (!trimmed) {
    return { skip: true, reason: 'empty' };
  }

  if (PURE_GREETING.test(trimmed)) {
    return { skip: true, reason: 'greeting' };
  }

  if (countSignificantTokens(trimmed) < SIGNIFICANT_TOKEN_MIN) {
    return { skip: true, reason: 'low-information' };
  }

  if (config.customGate) {
    const custom = config.customGate(trimmed);
    if (custom) return custom;
  }

  return { skip: false };
}

function countSignificantTokens(text: string): number {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let count = 0;
  for (const tok of tokens) {
    if (tok.length < 2) continue;
    if (STOPWORDS.has(tok)) continue;
    count++;
  }
  return count;
}
