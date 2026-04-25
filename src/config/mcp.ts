import { readRawSettings, updateRawSettings } from './settings-io.js';
import type { McpServerConfig } from './types.js';

export function getMcpServerConfigs(): Record<string, McpServerConfig> {
  try {
    const raw = readRawSettings();
    const mcp = raw.mcpServers;
    return (mcp && typeof mcp === 'object' && !Array.isArray(mcp)) ? mcp : {};
  } catch {
    return {};
  }
}

export function addMcpServerConfig(name: string, config: McpServerConfig): void {
  updateRawSettings(raw => {
    if (!raw.mcpServers || typeof raw.mcpServers !== 'object' || Array.isArray(raw.mcpServers)) {
      raw.mcpServers = {};
    }
    raw.mcpServers[name] = config;
  });
}

export function removeMcpServerConfig(name: string): void {
  updateRawSettings(raw => {
    if (raw.mcpServers && typeof raw.mcpServers === 'object') {
      delete raw.mcpServers[name];
    }
  });
}

function ensureModels(raw: Record<string, any>): Record<string, any> {
  if (!raw.models || typeof raw.models !== 'object' || Array.isArray(raw.models)) {
    raw.models = {
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      default: '',
      toolModel: null,
      available: [],
    };
  }
  return raw.models;
}

export function setDefaultModel(modelId: string): void {
  updateRawSettings(raw => {
    const models = ensureModels(raw);
    models.default = modelId;
  });
}

export function setToolModel(modelId: string): void {
  updateRawSettings(raw => {
    const models = ensureModels(raw);
    models.toolModel = modelId;
  });
}

export function clearToolModel(): void {
  updateRawSettings(raw => {
    if (raw.models && typeof raw.models === 'object') {
      raw.models.toolModel = null;
    }
  });
}

export function setProvider(provider: 'ollama' | 'huggingface'): void {
  updateRawSettings(raw => {
    const models = ensureModels(raw);
    models.provider = provider;
  });
}

export function setHuggingfaceToken(token: string): void {
  updateRawSettings(raw => {
    const models = ensureModels(raw);
    models.huggingfaceToken = token;
  });
}

export function setHuggingfaceBaseUrl(url: string): void {
  updateRawSettings(raw => {
    const models = ensureModels(raw);
    models.huggingfaceBaseUrl = url;
  });
}

export function getAvailableModels(): Array<{ id: string; name?: string; isCloud?: boolean }> {
  try {
    const raw = readRawSettings();
    const available = raw.models?.available;
    return Array.isArray(available) ? available : [];
  } catch {
    return [];
  }
}

export function getCurrentModel(): string {
  try {
    const raw = readRawSettings();
    const def = raw.models?.default;
    return typeof def === 'string' ? def : '';
  } catch {
    return '';
  }
}

export async function syncAvailableModels(): Promise<void> {
  const { listOllamaModelsDetailed } = await import('../providers/ollama.js');
  const { classifyModels, selectToolModel, selectFastModel } = await import('../providers/model-classifier.js');

  const detailedModels = await listOllamaModelsDetailed();
  const classified = classifyModels(detailedModels);

  updateRawSettings(raw => {
    const models = ensureModels(raw);

    models.available = classified.map(m => ({
      id: m.id,
      name: m.id,
      isCloud: m.isCloud,
    }));

    const hasLocal = classified.some(m => m.isLocal);
    const hasCloud = classified.some(m => m.isCloud);
    const currentDefault = typeof models.default === 'string' ? models.default : '';
    const currentDefaultIsCloud = classified.find(m => m.id === currentDefault)?.isCloud ?? false;

    if (!models.toolModel && hasLocal && hasCloud) {
      if (currentDefaultIsCloud) {
        models.toolModel = currentDefault;
        const fast = selectFastModel(classified);
        if (fast) {
          models.default = fast;
        }
      } else {
        const autoTool = selectToolModel(classified, currentDefault);
        if (autoTool) {
          models.toolModel = autoTool;
        }
      }
    }

    if (!models.default && classified.length > 0) {
      const fast = selectFastModel(classified);
      if (fast) {
        models.default = fast;
      } else {
        models.default = classified[0].id;
      }
    }
  });
}
