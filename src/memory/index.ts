export type { EmbeddingProvider } from './embeddings/index.js';
export {
  getEmbeddingProvider,
  isEmbeddingProviderAvailable,
  resetEmbeddingProviderCache,
  EmbeddingProviderError,
} from './embeddings/index.js';
export { cosine, recencyScore, bufferToFloat32, float32ToBuffer } from './similarity.js';
export type { EmbeddedMemory, RankedMemory, RankingWeights, GatingDecision } from './types.js';
export { retrieveRelevantMemories } from './retrieval.js';
export type { RetrievalDeps } from './retrieval.js';
export { buildContextBlock } from './context-builder.js';
