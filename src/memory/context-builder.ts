import { estimateTokens } from '../context/token-counter.js';
import type { RankedMemory } from './types.js';

const HEADER_LINES = [
  `## Your Memories`,
  `IMPORTANT: ALWAYS check these memories BEFORE executing tools or commands.`,
  `If the answer to the user's question is already here, respond directly without making tool calls.`,
  `These are facts you saved from previous sessions:`,
];

const FOOTER_LINE = `Use the \`memory\` tool to save new memories or search for more.`;

export function buildContextBlock(memories: RankedMemory[], budgetTokens: number): string {
  if (memories.length === 0 || budgetTokens <= 0) return '';

  const overheadTokens = estimateTokens([...HEADER_LINES, '', FOOTER_LINE].join('\n'));
  let remaining = budgetTokens - overheadTokens;
  if (remaining <= 0) return '';

  const lines: string[] = [];
  for (const mem of memories) {
    const line = `- [${mem.category}] **${mem.key}**: ${mem.content}`;
    const lineTokens = estimateTokens(line);
    if (lineTokens > remaining) break;
    lines.push(line);
    remaining -= lineTokens;
  }

  if (lines.length === 0) return '';

  return [...HEADER_LINES, ...lines, '', FOOTER_LINE].join('\n');
}
