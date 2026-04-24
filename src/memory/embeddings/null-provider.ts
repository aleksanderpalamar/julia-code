import type { EmbeddingProvider } from './provider.js';
import { EmbeddingProviderError } from './provider.js';

export class NullEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'null';
  readonly model = 'none';

  async available(): Promise<boolean> {
    return false;
  }

  async embed(_text: string): Promise<Float32Array> {
    throw new EmbeddingProviderError('embedding provider is disabled (null)');
  }
}
