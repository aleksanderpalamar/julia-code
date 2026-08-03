export interface AnnouncedToolIntent {
  index: number;
  phrase: string;
}

const ANNOUNCED_TOOL_INTENT_PHRASES = [
  'vou verificar', 'vou checar', 'deixa eu ver', 'deixe-me verificar',
  'vou executar', 'vou rodar', 'vou ler', 'vou listar',
  'vou abrir', 'vou inspecionar', 'vou analisar', 'vou explorar',
  'vou acessar', 'vou consultar', 'vou buscar',
  'let me check', 'let me verify', 'let me run', 'let me read',
  'let me look', 'let me see', 'let me open',
  'i\'ll check', 'i\'ll run', 'i\'ll read', 'i\'ll look', 'i\'ll open',
] as const;

/** Finds the first positive announcement of a tool-oriented action. */
export function findAnnouncedToolIntent(text: string): AnnouncedToolIntent | null {
  const lower = text.toLowerCase();
  let earliest: AnnouncedToolIntent | null = null;

  for (const phrase of ANNOUNCED_TOOL_INTENT_PHRASES) {
    let fromIndex = 0;
    while (fromIndex < lower.length) {
      const index = lower.indexOf(phrase, fromIndex);
      if (index === -1) break;
      const isPositiveMatch = hasPhraseBoundaries(lower, index, phrase)
        && !isNegatedPortugueseIntent(lower, index);
      if (isPositiveMatch && (!earliest || index < earliest.index)) {
        earliest = { index, phrase };
      }
      fromIndex = index + phrase.length;
    }
  }

  return earliest;
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

function isNegatedPortugueseIntent(text: string, index: number): boolean {
  const prefix = text.slice(Math.max(0, index - 8), index);
  return /(?:não|nao)\s+$/.test(prefix);
}

function hasPhraseBoundaries(text: string, index: number, phrase: string): boolean {
  const before = text[index - 1];
  const after = text[index + phrase.length];
  const isWord = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}_]/u.test(char);
  return !isWord(before) && !isWord(after);
}
