import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getSettingsPath } from './index.js';
import { SettingsSchema, type Settings } from './types.js';

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

export function isDirectoryTrusted(dir: string): boolean {
  const settings = readSettings();
  return settings.trustedDirectories?.includes(dir) ?? false;
}

export function trustDirectory(dir: string): void {
  const settings = readSettings();
  const dirs = settings.trustedDirectories ?? [];
  if (!dirs.includes(dir)) {
    dirs.push(dir);
  }
  settings.trustedDirectories = dirs;
  writeSettings(settings);
}

export function untrustDirectory(dir: string): void {
  const settings = readSettings();
  const dirs = settings.trustedDirectories ?? [];
  settings.trustedDirectories = dirs.filter(d => d !== dir);
  writeSettings(settings);
}

export function getTrustedDirectories(): string[] {
  const settings = readSettings();
  return settings.trustedDirectories ?? [];
}

export function untrustAll(): void {
  const settings = readSettings();
  settings.trustedDirectories = [];
  writeSettings(settings);
}
