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
 * A later sentence completes the announcement only when it contains something
 * beyond waiting language or another deferred action.
 */
export function findDeferredToolIntent(text: string): AnnouncedToolIntent | null {
  return findAnnouncedToolIntents(text).find(intent => {
    const sentenceEnd = findSentenceEnd(text, intent.index);
    return !containsCompletedFollowUp(text.slice(sentenceEnd));
  }) ?? null;
}

function findAnnouncedToolIntents(text: string): AnnouncedToolIntent[] {
  const lower = normalizeIntentText(text);
  const matches: AnnouncedToolIntent[] = [];

  for (const phrase of ANNOUNCED_TOOL_INTENT_PHRASES) {
    let fromIndex = 0;
    while (fromIndex < lower.length) {
      const index = lower.indexOf(phrase, fromIndex);
      if (index === -1) break;
      const intent = { index, phrase };
      const isPositiveMatch = hasPhraseBoundaries(lower, index, phrase)
        && !isNegatedIntent(lower, index)
        && !isCompletedDirectAnswer(lower, intent);
      if (isPositiveMatch) matches.push(intent);
      fromIndex = index + phrase.length;
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

export function needsToolCalling(text: string): boolean {
  const lower = normalizeIntentText(text);

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
  const clauseStart = findClauseStart(text, index);
  const prefix = text.slice(clauseStart, index);
  const portugueseNegation = /(?:^|[^\p{L}])(?:não|nao|nunca|jamais|nem)(?=$|[^\p{L}])/u;
  const englishNegation = /(?:^|[^\p{L}])(?:not|never|don't|dont|do not|won't|wont|will not|can't|cant|cannot)(?=$|[^\p{L}])/u;
  return portugueseNegation.test(prefix) || englishNegation.test(prefix);
}

function findClauseStart(text: string, index: number): number {
  let clauseStart = Math.max(
    text.lastIndexOf('.', index - 1),
    text.lastIndexOf('!', index - 1),
    text.lastIndexOf('?', index - 1),
    text.lastIndexOf(',', index - 1),
    text.lastIndexOf(';', index - 1),
    text.lastIndexOf(':', index - 1),
    text.lastIndexOf('\n', index - 1),
  ) + 1;

  const coordinatingBoundary = /\b(?:but|yet|however|nevertheless|mas|porém|porem|contudo|todavia)\b|[—–]|\s-\s/gu;
  for (const match of text.slice(0, index).matchAll(coordinatingBoundary)) {
    clauseStart = Math.max(clauseStart, match.index + match[0].length);
  }

  return clauseStart;
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

function containsCompletedFollowUp(text: string): boolean {
  const clauses = text.split(/(?:[.!?](?=\s|$)|\n)+/u);
  return clauses.some(clause => containsSubstantiveText(clause) && !isDeferredFollowUp(clause));
}

function isDeferredFollowUp(text: string): boolean {
  if (findAnnouncedToolIntent(text)) return true;

  const normalized = normalizeIntentText(text).trim();
  const englishDeferral = /^(?:one moment(?: please)?|just (?:a|one) moment(?: please)?|please wait|wait (?:a|one) moment|hold on|give me (?:a|one) moment|i(?:'m| am) (?:checking|looking|working on it)|i(?:'ll| will) (?:get back|return|report back)|thanks? for (?:your )?patience)\b/u;
  const portugueseDeferral = /^(?:um momento(?: por favor)?|s[oó] um momento(?: por favor)?|por favor aguarde|aguarde|espere (?:um|s[oó] um) momento|estou (?:verificando|checando|consultando|buscando|trabalhando nisso)|j[aá] volto|retorno em seguida|vou retornar|obrigad[oa] pela paci[eê]ncia)\b/u;
  return englishDeferral.test(normalized) || portugueseDeferral.test(normalized);
}

function isCompletedDirectAnswer(text: string, intent: AnnouncedToolIntent): boolean {
  const sentenceEnd = findSentenceEnd(text, intent.index);
  const suffix = text.slice(intent.index + intent.phrase.length, sentenceEnd);
  const internalReasoning = /^\s*(?:mentally|conceptually|logically|in my head|without tools|mentalmente|conceitualmente|logicamente|de cabeça|sem ferramentas)\b/u;
  if (internalReasoning.test(suffix)) return true;

  const separator = /[:;,]|[—–]|\s-\s/u.exec(suffix);
  if (!separator) return false;

  const resultClause = suffix.slice(separator.index + separator[0].length).trim();
  if (!containsSubstantiveText(resultClause)) return false;

  const answerWord = /^(?:yes|no|sim|não|nao|correct|incorrect|correto|incorreto|done|pronto)(?=$|[\s,.!?;:])/u;
  const resultPredicate = /(?:^|[^\p{L}])(?:is|are|was|were|equals|contains|shows|returns|exists|has|have|é|são|era|eram|está|estão|equivale|contém|contem|mostra|retorna|existe|tem|possui)(?=$|[^\p{L}])/u;
  return answerWord.test(resultClause)
    || resultPredicate.test(resultClause)
    || /[=≠]/u.test(resultClause);
}

function normalizeIntentText(text: string): string {
  return text.toLowerCase().replace(/[’‘ʼ]/gu, "'");
}
