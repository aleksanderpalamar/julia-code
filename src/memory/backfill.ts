import {
  countMemoriesWithoutEmbedding,
  getMemoriesWithoutEmbedding,
  updateMemoryEmbedding,
} from '../session/manager.js';
import { float32ToBuffer } from './similarity.js';
import {
  getEmbeddingProvider,
  isEmbeddingProviderAvailable,
} from './embeddings/index.js';

export interface BackfillOptions {
  batchSize?: number;
  maxConsecutiveFailures?: number;
  signal?: AbortSignal;
  onProgress?: (processed: number, total: number) => void;
}

export interface BackfillResult {
  processed: number;
  failed: number;
  total: number;
  aborted: boolean;
  reason?: 'provider-unavailable' | 'signal' | 'consecutive-failures' | 'completed';
}

export async function backfillMissingEmbeddings(
  opts: BackfillOptions = {},
): Promise<BackfillResult> {
  const batchSize = opts.batchSize ?? 20;
  const maxConsecutiveFailures = opts.maxConsecutiveFailures ?? 3;

  const available = await isEmbeddingProviderAvailable();
  if (!available) {
    return { processed: 0, failed: 0, total: 0, aborted: true, reason: 'provider-unavailable' };
  }

  const provider = getEmbeddingProvider();
  const total = countMemoriesWithoutEmbedding();
  if (total === 0) {
    return { processed: 0, failed: 0, total: 0, aborted: false, reason: 'completed' };
  }

  let processed = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  while (true) {
    if (opts.signal?.aborted) {
      return { processed, failed, total, aborted: true, reason: 'signal' };
    }

    const batch = getMemoriesWithoutEmbedding(batchSize);
    if (batch.length === 0) break;

    for (const mem of batch) {
      if (opts.signal?.aborted) {
        return { processed, failed, total, aborted: true, reason: 'signal' };
      }

      try {
        const vec = await provider.embed(mem.content);
        updateMemoryEmbedding(mem.key, float32ToBuffer(vec), provider.model);
        processed++;
        consecutiveFailures = 0;
      } catch (err) {
        failed++;
        consecutiveFailures++;
        process.stderr.write(
          `[memory] backfill failed for key=${mem.key}: ${errMessage(err)}\n`,
        );
        if (consecutiveFailures >= maxConsecutiveFailures) {
          return {
            processed,
            failed,
            total,
            aborted: true,
            reason: 'consecutive-failures',
          };
        }
      }

      opts.onProgress?.(processed, total);
    }
  }

  return { processed, failed, total, aborted: false, reason: 'completed' };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
