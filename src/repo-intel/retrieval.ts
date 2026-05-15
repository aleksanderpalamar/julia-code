import type { EmbeddingProvider } from '../memory/embeddings/index.js';
import { bufferToFloat32, cosine } from '../memory/similarity.js';
import { getEmbeddedChunks } from './storage.js';
import type { CodeChunk, RankedChunk } from './types.js';

export interface RepoRetrievalDeps {
  provider: EmbeddingProvider;
  limit: number;
  candidatePoolSize?: number;
  loadCandidates?: (poolSize: number) => CodeChunk[];
}

export async function retrieveRelevantChunks(
  input: string,
  deps: RepoRetrievalDeps,
): Promise<RankedChunk[]> {
  const available = await deps.provider.available().catch(() => false);
  if (!available) return [];

  let queryVec: Float32Array;
  try {
    queryVec = await deps.provider.embed(input);
  } catch (err) {
    process.stderr.write(`[repo-intel] embed failed, falling back: ${errMessage(err)}\n`);
    return [];
  }

  const loader = deps.loadCandidates ?? ((n) => getEmbeddedChunks(n));
  const poolSize = deps.candidatePoolSize ?? 2000;
  const candidates = loader(poolSize);
  if (candidates.length === 0) return [];

  const ranked: RankedChunk[] = [];
  for (const chunk of candidates) {
    if (!chunk.embedding) continue;
    const vec = bufferToFloat32(chunk.embedding);
    if (vec.length !== queryVec.length) continue;
    const similarity = cosine(queryVec, vec);
    if (similarity <= 0) continue;
    ranked.push({ chunk, similarity, score: similarity });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, deps.limit);
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
