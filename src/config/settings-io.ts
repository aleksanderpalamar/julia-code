import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getSettingsPath } from './index.js';
import { logMcp } from '../mcp/logger.js';

type RawSettings = Record<string, any>;

export function readRawSettings(): RawSettings {
  const path = getSettingsPath();
  if (!existsSync(path)) return {};
  let text: string;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (err) {
    logMcp(
      `[config] Failed to read ${path}: ${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  }
  try {
    const parsed = JSON.parse(text);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (err) {
    logMcp(
      `[config] Parsing failed. ${path}: ${err instanceof Error ? err.message : String(err)}. Update skipped to avoid data loss.`
    );
    throw err;
  }
}

function writeRawSettings(raw: RawSettings): void {
  const path = getSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(raw, null, 2), 'utf-8');
}

export function updateRawSettings(mutator: (raw: RawSettings) => void): void {
  let raw: RawSettings;
  try {
    raw = readRawSettings();
  } catch {
    return;
  }
  mutator(raw);
  writeRawSettings(raw);
}
