export interface ComplexitySignal {
  reason: string;
  length: number;
  numberedItems: number;
  bulletItems: number;
  actionVerbs: number;
  conjunctions: number;
  hasBatchKeyword: boolean;
}

export interface ComplexityResult {
  complex: boolean;
  signals: ComplexitySignal;
}

// Action verbs in imperative form, PT + EN. Used to detect multi-verb tasks.
const ACTION_VERBS_RE =
  /\b(crie|cria|criar|escreva|escrever|escreve|implemente|implementar|implementa|refatore|refatorar|refatora|teste|testar|analise|analisar|compare|comparar|divida|dividir|separe|separar|remova|remover|create|write|implement|refactor|test|analyze|compare|split|separate|remove|delete|migrate|migre|migrar|convert|converta|converter)\b/gi;

// Parallel/batch intent keywords. Strong hint that user wants many things done.
const BATCH_KEYWORDS_RE =
  /\b(todos|todas|cada|vários|várias|varios|varias|all|each|every|multiple|batch|em paralelo|in parallel)\b/i;

// Coordinating conjunctions. Counted to estimate "number of clauses".
// Word-boundaries are critical in PT — "e" appears inside many words.
const CONJUNCTIONS_RE = /\b(e|and|then|depois|além disso|also)\b/gi;

// Numbered list items — either multi-line ("1. foo\n2. bar\n3. baz") or
// inline ("1. foo, 2. bar e 3. baz"). We require the digit to be preceded
// by start-of-string or a non-word separator (whitespace, comma, semicolon,
// colon, period, paren). This avoids matching identifiers like "v1." while
// still catching the common TUI single-line form where users list items
// separated by commas or the word "e"/"and".
const NUMBERED_ITEM_RE = /(?:^|[\s,;:.()])\s*\d+[.)]\s+\S/g;

// Bullet list items are almost always multi-line — inline bullets are rare
// and ambiguous with the minus sign. Keep this strict (start-of-line only).
const BULLET_ITEM_RE = /(?:^|\n)\s*[-*]\s+\S/g;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

export function analyzeComplexity(userMessage: string): ComplexityResult {
  const msg = (userMessage ?? '').trim();
  const length = msg.length;

  const numberedItems = countMatches(msg, NUMBERED_ITEM_RE);
  const bulletItems = countMatches(msg, BULLET_ITEM_RE);
  const actionVerbs = countMatches(msg, ACTION_VERBS_RE);
  const conjunctions = countMatches(msg, CONJUNCTIONS_RE);
  const hasBatchKeyword = BATCH_KEYWORDS_RE.test(msg);

  const signals: ComplexitySignal = {
    reason: '',
    length,
    numberedItems,
    bulletItems,
    actionVerbs,
    conjunctions,
    hasBatchKeyword,
  };

  // Structural signals win regardless of length — an explicit list of 3+
  // items is the user already signaling parallelism.
  if (numberedItems >= 3) {
    signals.reason = 'numbered_list_3+';
    return { complex: true, signals };
  }

  if (bulletItems >= 3) {
    signals.reason = 'bullet_list_3+';
    return { complex: true, signals };
  }

  if (length < 80) {
    signals.reason = 'too_short';
    return { complex: false, signals };
  }

  if (length > 120 && hasBatchKeyword && actionVerbs >= 1) {
    signals.reason = 'long_batch_with_verb';
    return { complex: true, signals };
  }

  if (length > 150 && actionVerbs >= 3 && conjunctions >= 2) {
    signals.reason = 'multi_verb_with_conjunctions';
    return { complex: true, signals };
  }

  if (length > 300 && actionVerbs >= 2 && conjunctions >= 3) {
    signals.reason = 'very_long_multi_verb';
    return { complex: true, signals };
  }

  signals.reason = 'no_signal_combination_matched';
  return { complex: false, signals };
}

export function isLikelyComplex(userMessage: string): boolean {
  return analyzeComplexity(userMessage).complex;
}
