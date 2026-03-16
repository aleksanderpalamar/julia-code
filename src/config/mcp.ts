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
