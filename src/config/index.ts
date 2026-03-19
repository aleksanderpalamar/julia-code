import { config as loadEnv } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ConfigSchema, SettingsSchema, type Config, type Settings } from './types.js';

let _config: Config | null = null;
let _settings: Settings | null = null;

const SETTINGS_PATH = join(homedir(), '.juliacode', 'settings.json');

function loadSettings(): Settings | null {
  if (_settings) return _settings;

  if (!existsSync(SETTINGS_PATH)) return null;

  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8');
    _settings = SettingsSchema.parse(JSON.parse(raw));
    return _settings;
  } catch {
    return null;
  }
}

export function getSettingsPath(): string {
  return SETTINGS_PATH;
}

export function getSettings(): Settings | null {
  return _settings ?? loadSettings();
}

export function loadConfig(): Config {
  if (_config) return _config;

  loadEnv();
  const settings = loadSettings();

  // Priority: env vars > settings.json > defaults
  const juliaHome = join(homedir(), '.juliacode');

  _config = ConfigSchema.parse({
    ollamaHost: process.env.OLLAMA_HOST
      ?? settings?.models?.baseUrl,
    defaultModel: process.env.DEFAULT_MODEL
      ?? settings?.models?.default,
    maxToolIterations: process.env.MAX_TOOL_ITERATIONS
      ? Number(process.env.MAX_TOOL_ITERATIONS)
      : settings?.agent?.maxToolIterations,
    dbPath: process.env.DB_PATH
      ?? settings?.storage?.dbPath,
    compactionThreshold: process.env.COMPACTION_THRESHOLD
      ? Number(process.env.COMPACTION_THRESHOLD)
      : settings?.session?.compactionThreshold,
    compactionKeepRecent: process.env.COMPACTION_KEEP_RECENT
      ? Number(process.env.COMPACTION_KEEP_RECENT)
      : settings?.session?.compactionKeepRecent,
    workspace: process.env.WORKSPACE
      ?? settings?.workspace,
    // ACP
    acpEnabled: settings?.acp?.enabled,
    acpAutoOrchestrate: settings?.acp?.autoOrchestrate,
    acpMaxConcurrent: settings?.acp?.maxConcurrent,
    acpSubagentMaxIterations: settings?.acp?.subagentMaxIterations,
    acpDefaultModel: settings?.acp?.defaultModel,
    defaultTemperament: settings?.temperament?.default,
  });

  // Resolve relative dbPath against ~/.juliacode/ instead of cwd
  if (_config.dbPath && !_config.dbPath.startsWith('/')) {
    _config.dbPath = join(juliaHome, _config.dbPath);
  }

  return _config;
}

export function getConfig(): Config {
  if (!_config) return loadConfig();
  return _config;
}

export type { Config };
