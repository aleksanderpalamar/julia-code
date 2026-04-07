import { config as loadEnv } from 'dotenv';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ConfigSchema, SettingsSchema, type Config, type Settings } from './types.js';

let _config: Config | null = null;
let _settings: Settings | null = null;

const JULIA_HOME = join(homedir(), '.juliacode');
const SETTINGS_PATH = join(JULIA_HOME, 'settings.json');

function ensureJuliaHome(): void {
  mkdirSync(join(JULIA_HOME, 'data'), { recursive: true });

  if (!existsSync(SETTINGS_PATH)) {
    const defaults = {
      meta: { version: '0.1.0' },
      models: {
        provider: 'ollama',
        baseUrl: 'http://localhost:11434',
        default: '',
        available: [],
      },
      agent: { maxToolIterations: 25 },
      session: { compactionThreshold: 6000, compactionKeepRecent: 6 },
    };
    writeFileSync(SETTINGS_PATH, JSON.stringify(defaults, null, 2));
  }
}

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

  ensureJuliaHome();
  loadEnv();
  const settings = loadSettings();

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
    acpEnabled: settings?.acp?.enabled,
    acpAutoOrchestrate: settings?.acp?.autoOrchestrate,
    acpMaxConcurrent: settings?.acp?.maxConcurrent,
    acpSubagentMaxIterations: settings?.acp?.subagentMaxIterations,
    acpDefaultModel: settings?.acp?.defaultModel,
    acpCancelOnFailure: settings?.acp?.cancelOnFailure,
    toolModel: settings?.models?.toolModel,
    defaultTemperament: settings?.temperament?.default,
    contextReservePercent: settings?.context?.reservePercent,
    contextEmergencyThreshold: settings?.context?.emergencyThreshold,
    contextMaxToolResultTokens: settings?.context?.maxToolResultTokens,
  });

  if (_config.dbPath && !_config.dbPath.startsWith('/')) {
    _config.dbPath = join(JULIA_HOME, _config.dbPath);
  }

  return _config;
}

export function getConfig(): Config {
  if (!_config) return loadConfig();
  return _config;
}

export function reloadConfig(): Config {
  _config = null;
  _settings = null;
  return loadConfig();
}

export type { Config };
