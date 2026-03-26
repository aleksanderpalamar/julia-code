import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getSettingsPath } from './index.js';
import { SettingsSchema, type Settings, type McpServerConfig } from './types.js';

function readSettings(): Settings {
  const path = getSettingsPath();
  if (!existsSync(path)) return {};
  try {
    return SettingsSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
  } catch {
    return {};
  }
}

function writeSettings(settings: Settings): void {
  const path = getSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2), 'utf-8');
}

export function getMcpServerConfigs(): Record<string, McpServerConfig> {
  const settings = readSettings();
  return settings.mcpServers ?? {};
}

export function addMcpServerConfig(name: string, config: McpServerConfig): void {
  const settings = readSettings();
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }
  settings.mcpServers[name] = config;
  writeSettings(settings);
}

export function removeMcpServerConfig(name: string): void {
  const settings = readSettings();
  if (settings.mcpServers) {
    delete settings.mcpServers[name];
  }
  writeSettings(settings);
}

export function setDefaultModel(modelId: string): void {
  const settings = readSettings();
  if (!settings.models) {
    settings.models = { provider: 'ollama', baseUrl: 'http://localhost:11434', default: modelId, toolModel: null, available: [] };
  } else {
    settings.models.default = modelId;
  }
  writeSettings(settings);
}

export function setToolModel(modelId: string): void {
  const settings = readSettings();
  if (!settings.models) {
    settings.models = { provider: 'ollama', baseUrl: 'http://localhost:11434', default: '', toolModel: modelId, available: [] };
  } else {
    settings.models.toolModel = modelId;
  }
  writeSettings(settings);
}

export function clearToolModel(): void {
  const settings = readSettings();
  if (settings.models) {
    settings.models.toolModel = null;
  }
  writeSettings(settings);
}

export function getAvailableModels(): Array<{ id: string; name?: string }> {
  const settings = readSettings();
  return settings.models?.available ?? [];
}

export function getCurrentModel(): string {
  const settings = readSettings();
  return settings.models?.default ?? '';
}

export async function syncAvailableModels(): Promise<void> {
  const { listOllamaModelsDetailed } = await import('../providers/ollama.js');
  const { classifyModels, selectToolModel } = await import('../providers/model-classifier.js');

  const detailedModels = await listOllamaModelsDetailed();
  const classified = classifyModels(detailedModels);
  const settings = readSettings();

  if (!settings.models) {
    settings.models = { provider: 'ollama', baseUrl: 'http://localhost:11434', default: '', toolModel: null, available: [] };
  }

  settings.models!.available = classified.map(m => ({
    id: m.id,
    name: m.id,
    isCloud: m.isCloud,
  }));

  const { selectFastModel } = await import('../providers/model-classifier.js');
  const hasLocal = classified.some(m => m.isLocal);
  const hasCloud = classified.some(m => m.isCloud);
  const currentDefault = settings.models!.default;
  const currentDefaultIsCloud = classified.find(m => m.id === currentDefault)?.isCloud ?? false;

  // Auto-configure toolModel if not manually set
  if (!settings.models!.toolModel && hasLocal && hasCloud) {
    if (currentDefaultIsCloud) {
      // Default is cloud — set it as toolModel and switch default to best local
      settings.models!.toolModel = currentDefault;
      const fast = selectFastModel(classified);
      if (fast) {
        settings.models!.default = fast;
      }
    } else {
      // Default is local — pick the best cloud as toolModel
      const autoTool = selectToolModel(classified, currentDefault);
      if (autoTool) {
        settings.models!.toolModel = autoTool;
      }
    }
  }

  // If no default model set, pick the best local model (or first available)
  if (!settings.models!.default && classified.length > 0) {
    const fast = selectFastModel(classified);
    if (fast) {
      settings.models!.default = fast;
    } else {
      settings.models!.default = classified[0].id;
    }
  }

  writeSettings(settings);
}
