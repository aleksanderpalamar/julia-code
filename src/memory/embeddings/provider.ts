export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  available(): Promise<boolean>;
  embed(text: string): Promise<Float32Array>;
}

export class EmbeddingProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'EmbeddingProviderError';
  }
}
