import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getSettingsPath } from './index.js';

export type RawSettings = Record<string, any>;

export function readRawSettings(): RawSettings {
  const path = getSettingsPath();
  if (!existsSync(path)) return {};
  let text: string;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (err) {
    process.stderr.write(
      `[config] Falha ao ler ${path}: ${err instanceof Error ? err.message : String(err)}\n`
    );
    throw err;
  }
  try {
    const parsed = JSON.parse(text);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (err) {
    process.stderr.write(
      `[config] Falha ao parsear ${path}: ${err instanceof Error ? err.message : String(err)}. Atualização ignorada para evitar perda de dados.\n`
    );
    throw err;
  }
}

export function writeRawSettings(raw: RawSettings): void {
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
