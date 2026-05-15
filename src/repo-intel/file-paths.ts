import { execFileSync } from 'node:child_process';
import { getProjectDir } from '../config/workspace.js';
import { getAllFilePaths } from './storage.js';

let cached: string[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

export function getFilePathsForMentions(): string[] {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  const indexed = getAllFilePaths();
  if (indexed.length > 0) {
    cached = indexed;
    cachedAt = now;
    return indexed;
  }

  try {
    const out = execFileSync('git', ['ls-files'], {
      cwd: getProjectDir(),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 50 * 1024 * 1024,
    });
    cached = out.split('\n').filter(Boolean);
    cachedAt = now;
    return cached;
  } catch {
    cached = [];
    cachedAt = now;
    return cached;
  }
}

export function invalidateFilePathsCache(): void {
  cached = null;
  cachedAt = 0;
}
