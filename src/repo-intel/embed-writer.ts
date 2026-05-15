import { getEmbeddingProvider, isEmbeddingProviderAvailable } from '../memory/embeddings/index.js';
import { float32ToBuffer } from '../memory/similarity.js';
import { getPendingChunks, updateChunkEmbedding, countPendingChunks } from './storage.js';

export interface EmbedBatchOptions {
  batchSize?: number;
  maxConsecutiveFailures?: number;
  signal?: AbortSignal;
  onProgress?: (embedded: number, total: number) => void;
}

export interface EmbedBatchResult {
  embedded: number;
  failed: number;
  total: number;
  aborted: boolean;
  reason: 'completed' | 'signal' | 'provider-unavailable' | 'consecutive-failures';
}

export async function embedPendingBatch(opts: EmbedBatchOptions = {}): Promise<EmbedBatchResult> {
  const batchSize = opts.batchSize ?? 20;
  const maxConsecutiveFailures = opts.maxConsecutiveFailures ?? 3;

  const available = await isEmbeddingProviderAvailable();
  if (!available) {
    return { embedded: 0, failed: 0, total: 0, aborted: true, reason: 'provider-unavailable' };
  }

  const provider = getEmbeddingProvider();
  const total = countPendingChunks();
  if (total === 0) {
    return { embedded: 0, failed: 0, total: 0, aborted: false, reason: 'completed' };
  }

  let embedded = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  while (true) {
    if (opts.signal?.aborted) {
      return { embedded, failed, total, aborted: true, reason: 'signal' };
    }

    const batch = getPendingChunks(batchSize);
    if (batch.length === 0) break;

    for (const chunk of batch) {
      if (opts.signal?.aborted) {
        return { embedded, failed, total, aborted: true, reason: 'signal' };
      }

      try {
        const vec = await provider.embed(chunk.content);
        updateChunkEmbedding(chunk.id, float32ToBuffer(vec), provider.model);
        embedded++;
        consecutiveFailures = 0;
      } catch (err) {
        failed++;
        consecutiveFailures++;
        process.stderr.write(
          `[repo-intel] embed failed for chunk ${chunk.id} (${chunk.file_path}:${chunk.start_line}): ${errMessage(err)}\n`,
        );
        if (consecutiveFailures >= maxConsecutiveFailures) {
          return {
            embedded,
            failed,
            total,
            aborted: true,
            reason: 'consecutive-failures',
          };
        }
      }

      opts.onProgress?.(embedded, total);
    }
  }

  return { embedded, failed, total, aborted: false, reason: 'completed' };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
