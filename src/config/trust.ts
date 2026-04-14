import { readRawSettings, updateRawSettings } from './settings-io.js';

function readTrustedDirs(): string[] {
  try {
    const raw = readRawSettings();
    const dirs = raw.trustedDirectories;
    return Array.isArray(dirs) ? dirs.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

export function isDirectoryTrusted(dir: string): boolean {
  return readTrustedDirs().includes(dir);
}

export function trustDirectory(dir: string): void {
  updateRawSettings(raw => {
    const existing = Array.isArray(raw.trustedDirectories) ? raw.trustedDirectories : [];
    if (!existing.includes(dir)) {
      existing.push(dir);
    }
    raw.trustedDirectories = existing;
  });
}

export function untrustDirectory(dir: string): void {
  updateRawSettings(raw => {
    const existing = Array.isArray(raw.trustedDirectories) ? raw.trustedDirectories : [];
    raw.trustedDirectories = existing.filter((d: unknown) => d !== dir);
  });
}

export function getTrustedDirectories(): string[] {
  return readTrustedDirs();
}

export function untrustAll(): void {
  updateRawSettings(raw => {
    raw.trustedDirectories = [];
  });
}
