import { getConfig } from '../config/index.js';
import { getRecentMemories } from '../session/manager.js';
import { estimateTokens } from '../context/token-counter.js';
import { decideGating } from './gating.js';
import { getEmbeddingProvider, isEmbeddingProviderAvailable } from './embeddings/index.js';
import { retrieveRelevantMemories } from './retrieval.js';
import { buildContextBlock } from './context-builder.js';

export async function prepareMemoryContext(
  _sessionId: string,
  input: string | null,
  budgetTokens: number,
): Promise<string> {
  if (budgetTokens <= 0) return '';

  const config = getConfig();
  if (!config.memorySemantic.enabled) {
    return legacyRecentMemoriesBlock(budgetTokens);
  }

  if (!input || !input.trim()) {
    return legacyRecentMemoriesBlock(budgetTokens);
  }

  const gate = decideGating(input);
  if (gate.skip) return '';

  const available = await isEmbeddingProviderAvailable();
  if (!available) {
    process.stderr.write('[memory] provider unavailable, using legacy recent-memories fallback\n');
    return legacyRecentMemoriesBlock(budgetTokens);
  }

  const provider = getEmbeddingProvider();
  const ranked = await retrieveRelevantMemories(input, {
    provider,
    weights: config.memorySemantic.rankingWeights,
    halflifeDays: config.memorySemantic.recencyHalflifeDays,
    limit: config.memorySemantic.maxMemories,
  });

  if (ranked.length === 0) {
    return legacyRecentMemoriesBlock(budgetTokens);
  }

  return buildContextBlock(ranked, budgetTokens);
}

export function legacyRecentMemoriesBlock(budgetTokens: number): string {
  if (budgetTokens <= 0) return '';

  const allMemories = getRecentMemories(30);

  if (allMemories.length === 0) {
    return [
      `## Your Memories`,
      `(no saved memories yet for this user)`,
      ``,
      `When the user asks identity questions ("quem sou eu?", "do you know who I am?")`,
      `do NOT say "I have no memory" — either call \`memory\` action=recall to`,
      `double-check, or invite the user to share so you can save it via`,
      `\`memory\` action=save.`,
    ].join('\n');
  }

  const memoryLines: string[] = [];
  let memTokens = 0;
  for (const m of allMemories) {
    const line = `- [${m.category}] **${m.key}**: ${m.content}`;
    const lineTokens = estimateTokens(line);
    if (memTokens + lineTokens > budgetTokens) break;
    memoryLines.push(line);
    memTokens += lineTokens;
  }

  if (memoryLines.length === 0) {
    return [
      `## Your Memories`,
      `(${allMemories.length} memories exist but none fit the current budget)`,
      `Use \`memory\` action=recall with a focused query to retrieve specific facts.`,
    ].join('\n');
  }

  return [
    `## Your Memories`,
    `IMPORTANT: ALWAYS check these memories BEFORE executing tools or commands.`,
    `If the answer to the user's question is already here, respond directly without making tool calls.`,
    `These are facts you saved from previous sessions:`,
    ...memoryLines,
    ``,
    `Use the \`memory\` tool to save new memories or search for more.`,
  ].join('\n');
}
