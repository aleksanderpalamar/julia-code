import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let workDir: string;
let settingsPath: string;

vi.mock('../src/config/index.js', () => ({
  getSettingsPath: () => settingsPath,
}));

vi.mock('../src/mcp/logger.js', () => ({
  logMcp: () => {},
}));

import {
  setProvider,
  setHuggingfaceToken,
  setHuggingfaceBaseUrl,
} from '../src/config/mcp.js';

function readSettings(): Record<string, unknown> {
  return JSON.parse(readFileSync(settingsPath, 'utf-8'));
}

describe('provider/HF persistence helpers', () => {
  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'julia-provider-cfg-'));
    settingsPath = join(workDir, 'settings.json');
  });

  afterEach(() => {
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
  });

  it('setProvider creates models block when missing', () => {
    setProvider('huggingface');
    expect(readSettings().models).toMatchObject({ provider: 'huggingface' });
  });

  it('setProvider preserves other model fields', () => {
    writeFileSync(settingsPath, JSON.stringify({
      models: {
        provider: 'ollama',
        baseUrl: 'http://localhost:11434',
        default: 'qwen3:8b',
        toolModel: 'deepseek-v3.2:cloud',
        available: [{ id: 'qwen3:8b' }],
      },
      agent: { maxToolIterations: 30 },
    }, null, 2));
    setProvider('huggingface');
    const out = readSettings();
    expect(out.models).toMatchObject({
      provider: 'huggingface',
      baseUrl: 'http://localhost:11434',
      default: 'qwen3:8b',
      toolModel: 'deepseek-v3.2:cloud',
      available: [{ id: 'qwen3:8b' }],
    });
    expect(out.agent).toEqual({ maxToolIterations: 30 });
  });

  it('setHuggingfaceToken writes the token field without touching others', () => {
    writeFileSync(settingsPath, JSON.stringify({
      models: { provider: 'huggingface', default: 'meta-llama/Llama-3.3-70B-Instruct' },
    }, null, 2));
    setHuggingfaceToken('hf_abc');
    expect(readSettings().models).toMatchObject({
      provider: 'huggingface',
      default: 'meta-llama/Llama-3.3-70B-Instruct',
      huggingfaceToken: 'hf_abc',
    });
  });

  it('setHuggingfaceBaseUrl writes only the base URL field', () => {
    setHuggingfaceBaseUrl('https://router.staging.huggingface.co');
    expect(readSettings().models).toMatchObject({
      huggingfaceBaseUrl: 'https://router.staging.huggingface.co',
    });
  });

  it('helpers are idempotent', () => {
    setProvider('huggingface');
    setProvider('huggingface');
    setHuggingfaceToken('hf_x');
    setHuggingfaceToken('hf_x');
    expect(readSettings().models).toMatchObject({
      provider: 'huggingface',
      huggingfaceToken: 'hf_x',
    });
  });

  it('helpers can be combined and the resulting JSON is well-formed', () => {
    setProvider('huggingface');
    setHuggingfaceToken('hf_xyz');
    setHuggingfaceBaseUrl('https://router.huggingface.co');
    const out = readSettings();
    expect(out.models).toMatchObject({
      provider: 'huggingface',
      huggingfaceToken: 'hf_xyz',
      huggingfaceBaseUrl: 'https://router.huggingface.co',
    });
  });
});
