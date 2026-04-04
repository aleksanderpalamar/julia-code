import { getConfig } from '../config/index.js';

export interface ModelInfo {
  name: string;
  contextLength: number;
  capabilities: string[];
}

const DEFAULT_CONTEXT_LENGTH = 4096;
const cache = new Map<string, ModelInfo>();

/**
 * Fetch model metadata from Ollama /api/show.
 * Caches results in-memory for the lifetime of the process.
 */
export async function getModelInfo(model: string): Promise<ModelInfo> {
  const cached = cache.get(model);
  if (cached) return cached;

  const info: ModelInfo = { name: model, contextLength: DEFAULT_CONTEXT_LENGTH, capabilities: [] };

  try {
    const { ollamaHost } = getConfig();
    const res = await fetch(`${ollamaHost}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
    });

    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      info.contextLength = extractContextLength(data) ?? DEFAULT_CONTEXT_LENGTH;
      info.capabilities = Array.isArray(data.capabilities) ? data.capabilities as string[] : [];
    }
  } catch {
    // Network error — use fallback
  }

  cache.set(model, info);
  return info;
}

/**
 * Convenience: get just the context length for a model.
 */
export async function getContextLength(model: string): Promise<number> {
  const info = await getModelInfo(model);
  return info.contextLength;
}

/**
 * Check if a model supports native tool calling via Ollama capabilities.
 */
export async function supportsTools(model: string): Promise<boolean> {
  const info = await getModelInfo(model);
  return info.capabilities.includes('tools');
}

/**
 * Clear the model info cache (useful for testing or model changes).
 */
export function clearModelInfoCache(): void {
  cache.clear();
}

/**
 * Extract context_length from Ollama /api/show response.
 * The key varies by architecture: llama.context_length, qwen2.context_length, etc.
 * Also checks modelfile parameters for num_ctx as fallback.
 */
function extractContextLength(data: Record<string, unknown>): number | null {
  // Primary: look in model_info for *.context_length
  const modelInfo = data.model_info as Record<string, unknown> | undefined;
  if (modelInfo) {
    for (const key of Object.keys(modelInfo)) {
      if (key.endsWith('.context_length')) {
        const val = modelInfo[key];
        if (typeof val === 'number' && val > 0) return val;
      }
    }
  }

  // Fallback: parse modelfile for num_ctx parameter
  const modelfile = data.modelfile as string | undefined;
  if (modelfile) {
    const match = modelfile.match(/PARAMETER\s+num_ctx\s+(\d+)/i);
    if (match) return parseInt(match[1], 10);
  }

  return null;
}
