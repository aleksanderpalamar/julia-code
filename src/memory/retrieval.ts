import type { EmbeddingProvider } from './embeddings/index.js';
import { bufferToFloat32, cosine, recencyScore } from './similarity.js';
import { getEmbeddedMemories, type Memory } from '../session/manager.js';
import type { EmbeddedMemory, RankedMemory, RankingWeights } from './types.js';

const DEFAULT_IMPORTANCE = 0.5;

export interface RetrievalDeps {
  provider: EmbeddingProvider;
  weights: RankingWeights;
  halflifeDays: number;
  limit: number;
  now?: number;
  loadCandidates?: (candidateLimit: number) => Memory[];
  candidatePoolSize?: number;
}

export async function retrieveRelevantMemories(
  input: string,
  deps: RetrievalDeps,
): Promise<RankedMemory[]> {
  const available = await deps.provider.available().catch(() => false);
  if (!available) return [];

  let queryVec: Float32Array;
  try {
    queryVec = await deps.provider.embed(input);
  } catch (err) {
    process.stderr.write(`[memory] embed failed, falling back: ${errMessage(err)}\n`);
    return [];
  }

  const loader = deps.loadCandidates ?? ((n) => getEmbeddedMemories(n));
  const poolSize = deps.candidatePoolSize ?? 500;
  const candidates = loader(poolSize);
  if (candidates.length === 0) return [];

  const embedded = decodeEmbeddings(candidates, queryVec.length);
  if (embedded.length === 0) return [];

  const now = deps.now ?? Date.now();
  const ranked = embedded.map<RankedMemory>(mem => {
    const similarity = cosine(queryVec, mem.vector);
    const recency = recencyScore(mem.created_at, deps.halflifeDays, now);
    const effectiveImportance = mem.importance ?? DEFAULT_IMPORTANCE;
    const score =
      similarity * deps.weights.similarity +
      effectiveImportance * deps.weights.importance +
      recency * deps.weights.recency;
    return { ...mem, similarity, recency, effectiveImportance, score };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, deps.limit);
}

function decodeEmbeddings(memories: Memory[], expectedLength: number): EmbeddedMemory[] {
  const result: EmbeddedMemory[] = [];
  for (const mem of memories) {
    if (!mem.embedding) continue;
    const vector = bufferToFloat32(mem.embedding);
    if (vector.length !== expectedLength) continue;
    result.push({ ...mem, vector });
  }
  return result;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
