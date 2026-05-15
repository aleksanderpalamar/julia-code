export interface ChunkerOptions {
  linesPerChunk?: number;
  overlapLines?: number;
}

export interface Chunk {
  startLine: number;
  endLine: number;
  content: string;
  tokenEstimate: number;
}

const DEFAULT_LINES = 80;
const DEFAULT_OVERLAP = 20;

export function chunkContent(text: string, opts: ChunkerOptions = {}): Chunk[] {
  const linesPerChunk = opts.linesPerChunk ?? DEFAULT_LINES;
  const overlapLines = Math.min(opts.overlapLines ?? DEFAULT_OVERLAP, linesPerChunk - 1);

  if (linesPerChunk <= 0) return [];
  if (text.length === 0) return [];

  const lines = text.split('\n');
  if (lines.length === 0) return [];

  if (lines.length <= linesPerChunk) {
    const content = lines.join('\n');
    return [{
      startLine: 1,
      endLine: lines.length,
      content,
      tokenEstimate: estimateTokens(content),
    }];
  }

  const chunks: Chunk[] = [];
  const step = Math.max(1, linesPerChunk - overlapLines);
  let start = 0;
  while (start < lines.length) {
    const end = Math.min(start + linesPerChunk, lines.length);
    const slice = lines.slice(start, end);
    const content = slice.join('\n');
    chunks.push({
      startLine: start + 1,
      endLine: end,
      content,
      tokenEstimate: estimateTokens(content),
    });
    if (end >= lines.length) break;
    start += step;
  }
  return chunks;
}

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}
