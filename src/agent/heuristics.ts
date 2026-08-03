export interface AnnouncedToolIntent {
  index: number;
  phrase: string;
}

const ANNOUNCED_TOOL_INTENT_PHRASES = [
  'vou verificar', 'vou checar', 'deixa eu ver', 'deixe-me verificar',
  'vou executar', 'vou rodar', 'vou ler', 'vou listar',
  'vou abrir', 'vou inspecionar',
  'vou acessar', 'vou consultar', 'vou buscar',
  'let me check', 'let me verify', 'let me run', 'let me read',
  'let me look', 'let me see', 'let me open',
  'i\'ll check', 'i\'ll run', 'i\'ll read', 'i\'ll look', 'i\'ll open',
] as const;

/** Finds the first positive announcement of a tool-oriented action. */
export function findAnnouncedToolIntent(text: string): AnnouncedToolIntent | null {
  return findAnnouncedToolIntents(text)[0] ?? null;
}

/**
 * Finds an announced action that is still pending at the end of the response.
 * An announcement followed by another substantive sentence is treated as part
 * of an answer, not as a deferred tool call.
 */
export function findDeferredToolIntent(text: string): AnnouncedToolIntent | null {
  return findAnnouncedToolIntents(text).find(intent => {
    const sentenceEnd = findSentenceEnd(text, intent.index);
    return !containsSubstantiveText(text.slice(sentenceEnd));
  }) ?? null;
}

function findAnnouncedToolIntents(text: string): AnnouncedToolIntent[] {
  const lower = text.toLowerCase();
  const matches: AnnouncedToolIntent[] = [];

  for (const phrase of ANNOUNCED_TOOL_INTENT_PHRASES) {
    let fromIndex = 0;
    while (fromIndex < lower.length) {
      const index = lower.indexOf(phrase, fromIndex);
      if (index === -1) break;
      const isPositiveMatch = hasPhraseBoundaries(lower, index, phrase)
        && !isNegatedIntent(lower, index);
      if (isPositiveMatch) matches.push({ index, phrase });
      fromIndex = index + phrase.length;
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

export function needsToolCalling(text: string): boolean {
  const lower = text.toLowerCase();

  const refusalIndicators = [
    'não consigo acessar', 'não consigo executar', 'não consigo rodar',
    'não tenho acesso', 'não posso executar', 'não posso rodar',
    'não posso ler', 'não consigo ler', 'não consigo listar',
    'não tenho capacidade', 'não consigo verificar', 'não tenho como',
    'não posso acessar', 'sem acesso ao', 'sem acesso a ',
    'não consigo criar', 'não consigo escrever', 'não posso criar',
    'você pode executar', 'execute o comando', 'rode o comando',
    'tente rodar', 'você pode rodar', 'você pode usar o comando',
    'i cannot access', 'i cannot execute', 'i cannot read', 'i cannot run',
    'i don\'t have access', 'i can\'t access', 'i can\'t read',
    'i can\'t execute', 'i can\'t run', 'i can\'t list',
    'i can\'t create', 'i can\'t write',
    'you can run', 'try running', 'you could run',
    'unable to execute', 'unable to run', 'unable to access',
  ];
  if (refusalIndicators.some(i => lower.includes(i))) return true;

  const shellPatterns = [
    /^\s*(?:cat|ls|cd|grep|find|echo|pwd|whoami|uname|head|tail|wc|mkdir|rm|cp|mv|chmod|curl|wget|pip|npm|git|python|node|docker)\s+\S/m,
    /^\s*\$\s+\w+/m,
    /```(?:bash|sh|shell|terminal|console|zsh)\n/i,
  ];
  if (shellPatterns.some(p => p.test(text))) return true;

  if (findAnnouncedToolIntent(text)) return true;

  return false;
}

function isNegatedIntent(text: string, index: number): boolean {
  const clauseStart = Math.max(
    text.lastIndexOf('.', index - 1),
    text.lastIndexOf('!', index - 1),
    text.lastIndexOf('?', index - 1),
    text.lastIndexOf(',', index - 1),
    text.lastIndexOf(';', index - 1),
    text.lastIndexOf(':', index - 1),
    text.lastIndexOf('\n', index - 1),
  );
  const prefix = text.slice(clauseStart + 1, index).replaceAll('’', "'");
  const portugueseNegation = /(?:^|[^\p{L}])(?:não|nao|nunca|jamais|nem)(?=$|[^\p{L}])/u;
  const englishNegation = /(?:^|[^\p{L}])(?:not|never|don't|dont|do not|won't|wont|will not|can't|cant|cannot)(?=$|[^\p{L}])/u;
  return portugueseNegation.test(prefix) || englishNegation.test(prefix);
}

function hasPhraseBoundaries(text: string, index: number, phrase: string): boolean {
  const before = text[index - 1];
  const after = text[index + phrase.length];
  const isWord = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}_]/u.test(char);
  return !isWord(before) && !isWord(after);
}

function findSentenceEnd(text: string, index: number): number {
  for (let i = index; i < text.length; i++) {
    const char = text[i];
    if (char === '\n') return i + 1;
    if (char !== '.' && char !== '!' && char !== '?') continue;
    const next = text[i + 1];
    if (next === undefined || /\s/.test(next)) return i + 1;
  }
  return text.length;
}

function containsSubstantiveText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}
