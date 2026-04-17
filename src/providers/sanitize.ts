const LEAKAGE_PATTERNS: RegExp[] = [
  /<\|[^|<>\n]{1,60}\|>/g,
  /<think>[\s\S]*?<\/think>/g,
  /<\/?think>/g,
  /<functions\.[^>\s]{1,40}>[\s\S]*?<\/functions\.[^>\s]{1,40}>/g,
  /<\/?functions\.[^>\s]{1,40}>/g,
];

export function stripTemplateLeakage(text: string): string {
  let out = text;
  for (const re of LEAKAGE_PATTERNS) out = out.replace(re, '');
  return out;
}

function findFirstUnmatchedOpen(s: string, open: string, close: string): number {
  const opens: number[] = [];
  let i = 0;
  while ((i = s.indexOf(open, i)) !== -1) {
    opens.push(i);
    i += open.length;
  }
  const closes: number[] = [];
  i = 0;
  while ((i = s.indexOf(close, i)) !== -1) {
    closes.push(i);
    i += close.length;
  }
  const matched = new Set<number>();
  for (const c of closes) {
    const o = opens.find(op => op < c && !matched.has(op));
    if (o !== undefined) matched.add(o);
  }
  const firstUnmatched = opens.find(op => !matched.has(op));
  return firstUnmatched !== undefined ? firstUnmatched : -1;
}

export class StreamingTemplateStripper {
  private pending = '';
  private static readonly MAX_HOLDBACK = 80;

  push(chunk: string): string {
    this.pending += chunk;
    const cut = this.safeCutPoint(this.pending);
    const emit = stripTemplateLeakage(this.pending.slice(0, cut));
    this.pending = this.pending.slice(cut);
    return emit;
  }

  flush(): string {
    const out = stripTemplateLeakage(this.pending);
    this.pending = '';
    return out;
  }

  // Returns an index up to which it is safe to emit. Holds back:
  //  (a) any unclosed paired block start — <|..., <think>..., <functions.X>...
  //      whose matching close has not arrived yet;
  //  (b) any trailing partial prefix of an open marker (e.g. "<thi").
  // Holdback is capped at MAX_HOLDBACK so a malformed stream cannot grow
  // the buffer without bound.
  private safeCutPoint(s: string): number {
    const minCut = Math.max(0, s.length - StreamingTemplateStripper.MAX_HOLDBACK);
    let cut = s.length;

    // Fixed-string pairs.
    const fixedPairs: Array<[string, string]> = [
      ['<|', '|>'],
      ['<think>', '</think>'],
    ];
    for (const [open, close] of fixedPairs) {
      const unmatched = findFirstUnmatchedOpen(s, open, close);
      if (unmatched >= 0) cut = Math.min(cut, unmatched);
    }

    // Variable-name pair: <functions.X>...</functions.X>.
    const fOpens = Array.from(s.matchAll(/<functions\.[^>\s]{1,40}>/g)).map(m => m.index!);
    const fCloses = Array.from(s.matchAll(/<\/functions\.[^>\s]{1,40}>/g)).map(m => m.index!);
    const matchedOpens = new Set<number>();
    for (const c of fCloses) {
      const o = fOpens.find(op => op < c && !matchedOpens.has(op));
      if (o !== undefined) matchedOpens.add(o);
    }
    const unmatchedF = fOpens.find(op => !matchedOpens.has(op));
    if (unmatchedF !== undefined) cut = Math.min(cut, unmatchedF);

    // Trailing partial prefix of any open marker.
    const partials = ['<think>', '<|', '<functions.'];
    for (const p of partials) {
      for (let k = p.length - 1; k >= 1; k--) {
        if (s.endsWith(p.slice(0, k))) {
          cut = Math.min(cut, s.length - k);
          break;
        }
      }
    }

    return Math.max(cut, minCut);
  }
}
