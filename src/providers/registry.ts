import type { LLMProvider } from './types.js';
import { OllamaProvider } from './ollama.js';
import { HuggingFaceProvider } from './huggingface.js';
import { getConfig } from '../config/index.js';

const providers = new Map<string, LLMProvider>();

export function registerProvider(provider: LLMProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): LLMProvider {
  const p = providers.get(name);
  if (!p) throw new Error(`Provider "${name}" not found`);
  return p;
}

export function hasProvider(name: string): boolean {
  return providers.has(name);
}

export function resetProviders(): void {
  providers.clear();
}

export function initProviders(): void {
  resetProviders();
  registerProvider(new OllamaProvider());

  const config = getConfig();
  if (config.huggingfaceToken) {
    registerProvider(
      new HuggingFaceProvider({
        baseUrl: config.huggingfaceBaseUrl,
        token: config.huggingfaceToken,
      }),
    );
  }
}

export function getActiveProvider(): LLMProvider {
  const { provider } = getConfig();
  if (providers.has(provider)) {
    return providers.get(provider)!;
  }
  if (provider !== 'ollama') {
    process.stderr.write(
      `[provider] "${provider}" não registrado (token ausente?), caindo para ollama\n`,
    );
  }
  return getProvider('ollama');
}
