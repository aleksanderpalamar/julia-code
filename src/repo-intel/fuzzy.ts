export interface FuzzyMatch {
  value: string;
  score: number;
}

export function fuzzyRank(query: string, candidates: string[], limit?: number): FuzzyMatch[] {
  const q = query.toLowerCase();
  if (q.length === 0) {
    const all = candidates.map(c => ({ value: c, score: 0 }));
    return limit ? all.slice(0, limit) : all;
  }
  const scored: FuzzyMatch[] = [];
  for (const candidate of candidates) {
    const score = fuzzyScore(q, candidate.toLowerCase(), candidate);
    if (score > 0) scored.push({ value: candidate, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return limit ? scored.slice(0, limit) : scored;
}

export function fuzzyScore(query: string, candidateLower: string, candidateOriginal: string): number {
  if (query.length === 0) return 0;
  const slashIdx = candidateOriginal.lastIndexOf('/');
  const basename = slashIdx >= 0 ? candidateOriginal.slice(slashIdx + 1).toLowerCase() : candidateLower;

  if (basename === query) return 2.0;
  if (basename.startsWith(query)) return 1.5 - (basename.length - query.length) / 100;

  let firstMatchIdx = -1;
  let matchedCount = 0;
  let gaps = 0;
  let prevIdx = -1;

  let qIdx = 0;
  for (let i = 0; i < candidateLower.length && qIdx < query.length; i++) {
    if (candidateLower[i] === query[qIdx]) {
      if (firstMatchIdx < 0) firstMatchIdx = i;
      if (prevIdx >= 0 && i !== prevIdx + 1) gaps++;
      prevIdx = i;
      matchedCount++;
      qIdx++;
    }
  }

  if (matchedCount < query.length) return 0;

  const positionScore = 1 / (firstMatchIdx + 1);
  const completenessScore = matchedCount / query.length;
  const gapPenalty = gaps * 0.05;
  const lengthPenalty = candidateOriginal.length / 1000;

  const basenameBoost = basename.includes(query) ? 0.3 : 0;

  return positionScore + completenessScore + basenameBoost - gapPenalty - lengthPenalty;
}
