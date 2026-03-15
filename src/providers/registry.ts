import type { LLMProvider } from './types.js';
import { OllamaProvider } from './ollama.js';

const providers = new Map<string, LLMProvider>();

export function registerProvider(provider: LLMProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): LLMProvider {
  const p = providers.get(name);
  if (!p) throw new Error(`Provider "${name}" not found`);
  return p;
}

export function initProviders(): void {
  registerProvider(new OllamaProvider());
}
