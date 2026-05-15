export interface CodeGatingDecision {
  skip: boolean;
  reason?: string;
}

const PURE_GREETING = /^(?:oi|ola|olá|e\s*a[ií]|hello|hi|hey|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|obrigad[oa]|thanks?|valeu|tchau|bye)[\s!?.,]*$/i;

const META_QUERIES = [
  /^(?:que|what)\s+(?:horas?|time|day|date|dia)/i,
  /^(?:tudo\s+bem|how\s+are\s+you|how['’]?s\s+it\s+going)\??$/i,
  /^(?:bom|good|legal|nice|cool)[!.?\s]*$/i,
];

const STOPWORDS = new Set([
  'a', 'o', 'as', 'um', 'uma', 'uns', 'umas',
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'e', 'ou', 'mas', 'que', 'se', 'por', 'para', 'com', 'sem',
  'eu', 'tu', 'ele', 'ela', 'voce', 'você', 'nós', 'eles', 'elas',
  'meu', 'minha', 'teu', 'tua', 'seu', 'sua',
  'the', 'an', 'of', 'in', 'on', 'at', 'is', 'are', 'was', 'were',
  'i', 'me', 'my', 'you', 'your', 'it', 'its', 'to', 'from', 'and', 'or', 'but',
  'tudo', 'bem', 'ai', 'aí', 'hoje', 'agora', 'pode', 'pode',
]);

const SIGNIFICANT_TOKEN_MIN = 2;

const CODE_LIKE_RE = /(?:[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*\(|\/[a-zA-Z0-9_./\-]+|[a-zA-Z_][a-zA-Z0-9_]*[A-Z][a-zA-Z0-9_]*|`[^`]+`)/;

export function decideCodeGating(input: string): CodeGatingDecision {
  const trimmed = input.trim();
  if (!trimmed) return { skip: true, reason: 'empty' };
  if (PURE_GREETING.test(trimmed)) return { skip: true, reason: 'greeting' };
  for (const re of META_QUERIES) {
    if (re.test(trimmed)) return { skip: true, reason: 'meta-question' };
  }
  const tokens = countSignificantTokens(trimmed);
  const hasCode = hasCodeLikeToken(trimmed);
  if (!hasCode && tokens < SIGNIFICANT_TOKEN_MIN) {
    return { skip: true, reason: 'low-information' };
  }
  if (!hasCode && tokens < 4) {
    return { skip: true, reason: 'no-code-context' };
  }
  return { skip: false };
}

function countSignificantTokens(text: string): number {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_./\-]/gu, ' ')
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

function hasCodeLikeToken(text: string): boolean {
  return CODE_LIKE_RE.test(text);
}
