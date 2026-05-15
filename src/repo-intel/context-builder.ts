import { estimateTokens } from '../context/token-counter.js';
import type { RankedChunk } from './types.js';

const PREAMBLE = [
  '## Relevant Code from Repository',
  'The following code snippets were retrieved via semantic search of the user\'s prompt.',
  'They may or may not be relevant — use your judgment.',
  'File paths are repo-relative. Line numbers are 1-based and inclusive.',
].join('\n');

const ENVELOPE_OVERHEAD = 30;
const MIN_BODY_TOKENS = 80;
const HARD_CAP_CHUNKS = 5;

interface MergedChunk {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string | null;
  tokenEstimate: number;
  score: number;
}

export function buildRepoContextBlock(ranked: RankedChunk[], budgetTokens: number): string {
  if (ranked.length === 0 || budgetTokens <= 0) return '';

  const overhead = estimateTokens(PREAMBLE) + 4;
  let remaining = budgetTokens - overhead;
  if (remaining <= MIN_BODY_TOKENS) return '';

  const merged = mergeSameFile(ranked.slice(0, HARD_CAP_CHUNKS));
  const sections: string[] = [];

  for (const m of merged) {
    if (sections.length >= HARD_CAP_CHUNKS) break;
    const headerTokens = ENVELOPE_OVERHEAD;
    if (remaining < headerTokens + MIN_BODY_TOKENS) break;

    const fence = m.language ?? '';
    const header = `### ${m.filePath}:${m.startLine}-${m.endLine}`;
    const fullBody = '```' + fence + '\n' + m.content + '\n```';
    const fullTokens = headerTokens + estimateTokens(fullBody);

    if (fullTokens <= remaining) {
      sections.push(header + '\n' + fullBody);
      remaining -= fullTokens;
      continue;
    }

    const availableForBody = remaining - headerTokens - 8;
    if (availableForBody < MIN_BODY_TOKENS) break;

    const truncated = truncateContent(m.content, availableForBody);
    const body = '```' + fence + '\n' + truncated + '\n// ... [truncated]\n```';
    sections.push(header + '\n' + body);
    remaining -= headerTokens + estimateTokens(body);
    break;
  }

  if (sections.length === 0) return '';
  return PREAMBLE + '\n\n' + sections.join('\n\n');
}

function mergeSameFile(ranked: RankedChunk[]): MergedChunk[] {
  const byFile = new Map<string, MergedChunk>();
  const order: string[] = [];
  for (const r of ranked) {
    const c = r.chunk;
    const key = c.file_path;
    const existing = byFile.get(key);
    if (existing) {
      const overlaps = c.start_line <= existing.endLine && c.end_line >= existing.startLine;
      existing.startLine = Math.min(existing.startLine, c.start_line);
      existing.endLine = Math.max(existing.endLine, c.end_line);
      existing.score = Math.max(existing.score, r.score);
      if (!overlaps) {
        existing.content = existing.content + '\n// ...\n' + c.content;
        existing.tokenEstimate = estimateTokens(existing.content);
      }
    } else {
      byFile.set(key, {
        filePath: c.file_path,
        startLine: c.start_line,
        endLine: c.end_line,
        content: c.content,
        language: c.language,
        tokenEstimate: c.token_estimate,
        score: r.score,
      });
      order.push(key);
    }
  }
  return order.map(k => byFile.get(k)!);
}

function truncateContent(content: string, maxTokens: number): string {
  const maxChars = Math.max(0, maxTokens * 4);
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars);
}
