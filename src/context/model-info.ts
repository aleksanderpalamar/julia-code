import { getConfig } from '../config/index.js';

export interface ModelInfo {
  name: string;
  contextLength: number;
  capabilities: string[];
}

const DEFAULT_CONTEXT_LENGTH = 4096;
const cache = new Map<string, ModelInfo>();

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
  }

  cache.set(model, info);
  return info;
}

export async function getContextLength(model: string): Promise<number> {
  const info = await getModelInfo(model);
  return info.contextLength;
}

export async function supportsTools(model: string): Promise<boolean> {
  const info = await getModelInfo(model);
  return info.capabilities.includes('tools');
}

export function clearModelInfoCache(): void {
  cache.clear();
}

function extractContextLength(data: Record<string, unknown>): number | null {
  const modelInfo = data.model_info as Record<string, unknown> | undefined;
  if (modelInfo) {
    for (const key of Object.keys(modelInfo)) {
      if (key.endsWith('.context_length')) {
        const val = modelInfo[key];
        if (typeof val === 'number' && val > 0) return val;
      }
    }
  }

  const modelfile = data.modelfile as string | undefined;
  if (modelfile) {
    const match = modelfile.match(/PARAMETER\s+num_ctx\s+(\d+)/i);
    if (match) return parseInt(match[1], 10);
  }

  return null;
}
