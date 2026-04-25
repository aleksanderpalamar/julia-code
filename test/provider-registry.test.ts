import { describe, it, expect, beforeEach, vi } from 'vitest';

let mockConfig: {
  provider: 'ollama' | 'huggingface';
  ollamaHost: string;
  huggingfaceBaseUrl: string;
  huggingfaceToken: string | null;
} = {
  provider: 'ollama',
  ollamaHost: 'http://localhost:11434',
  huggingfaceBaseUrl: 'https://router.huggingface.co',
  huggingfaceToken: null,
};

vi.mock('../src/config/index.js', () => ({
  getConfig: () => mockConfig,
}));

import {
  initProviders,
  getProvider,
  getActiveProvider,
  hasProvider,
  resetProviders,
} from '../src/providers/registry.js';

describe('provider registry', () => {
  beforeEach(() => {
    resetProviders();
  });

  it('registers only ollama by default', () => {
    mockConfig = {
      provider: 'ollama',
      ollamaHost: 'http://localhost:11434',
      huggingfaceBaseUrl: 'https://router.huggingface.co',
      huggingfaceToken: null,
    };
    initProviders();
    expect(hasProvider('ollama')).toBe(true);
    expect(hasProvider('huggingface')).toBe(false);
  });

  it('registers huggingface when token is present', () => {
    mockConfig = {
      provider: 'huggingface',
      ollamaHost: 'http://localhost:11434',
      huggingfaceBaseUrl: 'https://router.huggingface.co',
      huggingfaceToken: 'hf_xxx',
    };
    initProviders();
    expect(hasProvider('ollama')).toBe(true);
    expect(hasProvider('huggingface')).toBe(true);
  });

  it('getActiveProvider returns the configured provider', () => {
    mockConfig = {
      provider: 'huggingface',
      ollamaHost: 'http://localhost:11434',
      huggingfaceBaseUrl: 'https://router.huggingface.co',
      huggingfaceToken: 'hf_xxx',
    };
    initProviders();
    expect(getActiveProvider().name).toBe('huggingface');
  });

  it('getActiveProvider falls back to ollama when configured provider is not registered', () => {
    mockConfig = {
      provider: 'huggingface',
      ollamaHost: 'http://localhost:11434',
      huggingfaceBaseUrl: 'https://router.huggingface.co',
      huggingfaceToken: null,
    };
    initProviders();
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(getActiveProvider().name).toBe('ollama');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('"huggingface" não registrado'));
    stderrSpy.mockRestore();
  });

  it('getProvider throws for unknown provider', () => {
    initProviders();
    expect(() => getProvider('mystery')).toThrow(/not found/);
  });
});
