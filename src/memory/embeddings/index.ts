import { getConfig } from '../../config/index.js';
import type { EmbeddingProvider } from './provider.js';
import { OllamaEmbeddingProvider } from './ollama-provider.js';
import { NullEmbeddingProvider } from './null-provider.js';

export type { EmbeddingProvider } from './provider.js';
export { EmbeddingProviderError } from './provider.js';

interface CachedProvider {
  provider: EmbeddingProvider;
  providerKind: 'ollama' | 'null';
  model: string;
  host: string;
}

interface CachedAvailability {
  value: boolean;
  expiresAt: number;
}

let cachedProvider: CachedProvider | null = null;
let cachedAvailability: CachedAvailability | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  const config = getConfig();
  const kind = config.memorySemantic.provider;
  const model = config.memorySemantic.embeddingModel;
  const host = config.ollamaHost;

  if (
    cachedProvider &&
    cachedProvider.providerKind === kind &&
    cachedProvider.model === model &&
    cachedProvider.host === host
  ) {
    return cachedProvider.provider;
  }

  const provider: EmbeddingProvider = kind === 'ollama'
    ? new OllamaEmbeddingProvider({ host, model })
    : new NullEmbeddingProvider();

  cachedProvider = { provider, providerKind: kind, model, host };
  cachedAvailability = null;
  return provider;
}

export async function isEmbeddingProviderAvailable(): Promise<boolean> {
  const config = getConfig();
  const ttl = config.memorySemantic.availabilityCheckTtlMs;
  const now = Date.now();
  if (cachedAvailability && cachedAvailability.expiresAt > now) {
    return cachedAvailability.value;
  }
  const provider = getEmbeddingProvider();
  const value = await provider.available().catch(() => false);
  cachedAvailability = { value, expiresAt: now + ttl };
  return value;
}

export function resetEmbeddingProviderCache(): void {
  cachedProvider = null;
  cachedAvailability = null;
}
