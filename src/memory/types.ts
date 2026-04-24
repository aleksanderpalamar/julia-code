import type { Memory } from '../session/manager.js';

export interface RankingWeights {
  similarity: number;
  importance: number;
  recency: number;
}

export interface EmbeddedMemory extends Memory {
  vector: Float32Array;
}

export interface RankedMemory extends EmbeddedMemory {
  score: number;
  similarity: number;
  recency: number;
  effectiveImportance: number;
}

export interface GatingDecision {
  skip: boolean;
  reason?: string;
}
