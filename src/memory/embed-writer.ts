import { getMemory, updateMemoryEmbedding } from '../session/manager.js';
import { float32ToBuffer } from './similarity.js';
import { getEmbeddingProvider, isEmbeddingProviderAvailable } from './embeddings/index.js';

export async function ensureEmbedding(key: string): Promise<boolean> {
  const available = await isEmbeddingProviderAvailable();
  if (!available) return false;

  const memory = getMemory(key);
  if (!memory) return false;

  const provider = getEmbeddingProvider();
  try {
    const vec = await provider.embed(memory.content);
    updateMemoryEmbedding(key, float32ToBuffer(vec), provider.model);
    return true;
  } catch (err) {
    process.stderr.write(`[memory] ensureEmbedding failed for key=${key}: ${errMessage(err)}\n`);
    return false;
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
