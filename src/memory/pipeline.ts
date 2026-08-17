import { getConfig } from '../config/index.js';
import { getRecentMemories } from '../session/manager.js';
import { estimateTokens } from '../context/token-counter.js';
import { recordEvent } from '../observability/logger.js';
import { decideGating } from './gating.js';
import { getEmbeddingProvider, isEmbeddingProviderAvailable } from './embeddings/index.js';
import { retrieveRelevantMemories } from './retrieval.js';
import {
  buildContextBlock,
  USER_FACTS_FOOTER_LINE,
  USER_FACTS_HEADER_LINES,
  USER_FACTS_HEADING,
} from './context-builder.js';
import { isSensitiveMemoryKey } from './sensitivity.js';

export async function prepareMemoryContext(
  sessionId: string,
  input: string | null,
  budgetTokens: number,
  turnId?: string,
): Promise<string> {
  if (budgetTokens <= 0) return '';

  const config = getConfig();
  if (!config.memorySemantic.enabled) {
    return legacyRelevantMemoriesBlock(input, budgetTokens);
  }

  if (!input || !input.trim()) {
    return legacyRecentMemoriesBlock(budgetTokens);
  }

  const gate = decideGating(input);
  if (gate.skip) return '';

  const startedAt = Date.now();
  const available = await isEmbeddingProviderAvailable();
  if (!available) {
    process.stderr.write('[memory] provider unavailable, using legacy recent-memories fallback\n');
    recordRetrieval({
      turnId, sessionId, candidates: 0, returned: 0, topScore: null,
      startedAt, providerAvailable: false,
    });
    return legacyRelevantMemoriesBlock(input, budgetTokens);
  }

  const provider = getEmbeddingProvider();
  const ranked = await retrieveRelevantMemories(input, {
    provider,
    weights: config.memorySemantic.rankingWeights,
    halflifeDays: config.memorySemantic.recencyHalflifeDays,
    limit: config.memorySemantic.maxMemories,
  });

  recordRetrieval({
    turnId,
    sessionId,
    candidates: ranked.length,
    returned: ranked.length,
    topScore: ranked[0]?.score ?? null,
    startedAt,
    providerAvailable: true,
  });

  if (ranked.length === 0) {
    return legacyRelevantMemoriesBlock(input, budgetTokens);
  }

  return buildContextBlock(ranked, budgetTokens);
}

function recordRetrieval(input: {
  turnId: string | undefined;
  sessionId: string;
  candidates: number;
  returned: number;
  topScore: number | null;
  startedAt: number;
  providerAvailable: boolean;
}): void {
  if (!input.turnId) return;
  recordEvent('memory_retrieval', {
    turnId: input.turnId,
    sessionId: input.sessionId,
    candidates: input.candidates,
    returned: input.returned,
    topScore: input.topScore,
    durationMs: Date.now() - input.startedAt,
    providerAvailable: input.providerAvailable,
  });
}

export function legacyRecentMemoriesBlock(budgetTokens: number): string {
  return buildLegacyMemoryBlock(getRecentMemories(30), budgetTokens);
}

export function legacyRelevantMemoriesBlock(
  input: string | null,
  budgetTokens: number,
): string {
  const memories = getRecentMemories(30);
  if (!input?.trim()) return buildLegacyMemoryBlock(memories, budgetTokens);
  return buildLegacyMemoryBlock(rankLegacyMemories(memories, input), budgetTokens);
}

function buildLegacyMemoryBlock(
  memories: ReturnType<typeof getRecentMemories>,
  budgetTokens: number,
): string {
  if (budgetTokens <= 0) return '';

  const safeMemories = memories.filter(memory => !isSensitiveMemoryKey(memory.key));

  if (safeMemories.length === 0) {
    return [
      USER_FACTS_HEADING,
      `(no saved facts yet for this user)`,
      ``,
      `Perguntas como "quem sou eu?" e "who am I?" referem-se ao usuário humano, não à Julia.`,
      `Quando o usuário fizer uma dessas perguntas,`,
      `do NOT say "I have no memory" — either call \`memory\` action=recall to`,
      `double-check, or invite the user to share so you can save it via`,
      `\`memory\` action=save.`,
    ].join('\n');
  }

  const memoryLines: string[] = [];
  let memTokens = 0;
  for (const m of safeMemories) {
    const line = `- Fato do usuário [${m.category}] **${m.key}**: ${m.content}`;
    const lineTokens = estimateTokens(line);
    if (memTokens + lineTokens > budgetTokens) continue;
    memoryLines.push(line);
    memTokens += lineTokens;
  }

  if (memoryLines.length === 0) {
    return [
      USER_FACTS_HEADING,
      `(${safeMemories.length} facts about the user exist but none fit the current budget)`,
      `Use \`memory\` action=recall with a focused query to retrieve them.`,
    ].join('\n');
  }

  return [
    ...USER_FACTS_HEADER_LINES,
    ...memoryLines,
    ``,
    USER_FACTS_FOOTER_LINE,
  ].join('\n');
}

function rankLegacyMemories(
  memories: ReturnType<typeof getRecentMemories>,
  input: string,
): ReturnType<typeof getRecentMemories> {
  const queryTokens = expandQueryTokens(input);
  return memories
    .map((memory, recencyIndex) => ({
      memory,
      recencyIndex,
      relevance: scoreLegacyMemory(memory, queryTokens),
    }))
    .sort((left, right) => (
      right.relevance - left.relevance || left.recencyIndex - right.recencyIndex
    ))
    .map(candidate => candidate.memory);
}

function scoreLegacyMemory(
  memory: ReturnType<typeof getRecentMemories>[number],
  queryTokens: ReadonlySet<string>,
): number {
  const keyTokens = new Set(tokenize(memory.key));
  const categoryTokens = new Set(tokenize(memory.category));
  const contentTokens = new Set(tokenize(memory.content));
  let score = 0;
  for (const token of queryTokens) {
    if (keyTokens.has(token)) score += 6;
    if (categoryTokens.has(token)) score += 3;
    if (contentTokens.has(token)) score += 2;
  }
  return score;
}

function expandQueryTokens(input: string): ReadonlySet<string> {
  const tokens = new Set(tokenize(input));
  const normalized = normalize(input);
  const identityQuestion = /\b(?:quem\s+(?:sou|es)\s+eu|quem\s+eu\s+sou|(?:tu|voce)\s+sabe[s]?\s+quem\s+(?:sou|es)\s+eu|who\s+am\s+i|do\s+you\s+know\s+(?:me|who\s+i\s+am))\b/u;
  if (identityQuestion.test(normalized)) {
    ['user', 'name', 'nome', 'identity', 'identidade'].forEach(token => tokens.add(token));
  }
  return tokens;
}

function tokenize(value: string): readonly string[] {
  return normalize(value).split(/[^a-z0-9]+/u).filter(token => token.length > 1);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
