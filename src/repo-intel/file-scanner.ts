import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { getProjectDir } from '../config/workspace.js';

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.tif', '.tiff',
  '.pdf', '.zip', '.gz', '.tar', '.tgz', '.bz2', '.xz', '.7z',
  '.so', '.o', '.a', '.dylib', '.dll', '.exe', '.bin', '.wasm',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.wav', '.flac', '.ogg', '.mov', '.avi', '.mkv',
  '.psd', '.ai', '.sketch', '.fig',
  '.pyc', '.class', '.jar', '.war',
]);

const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_FILES = 5_000;

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
  '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
  '.java': 'java', '.kt': 'kotlin', '.swift': 'swift', '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp', '.cs': 'csharp',
  '.php': 'php', '.lua': 'lua', '.scala': 'scala', '.r': 'r',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash', '.fish': 'shell',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
  '.xml': 'xml', '.html': 'html', '.css': 'css', '.scss': 'scss',
  '.md': 'markdown', '.mdx': 'markdown', '.sql': 'sql',
};

export interface ScanOptions {
  maxBytes?: number;
  maxFiles?: number;
}

export interface ScanResult {
  files: string[];
  skippedBinary: number;
  skippedLarge: number;
  skippedOverCap: number;
  isGitRepo: boolean;
}

export function listIndexableFiles(opts: ScanOptions = {}): ScanResult {
  const projectDir = getProjectDir();
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;

  let tracked: string[];
  try {
    const out = execFileSync('git', ['ls-files'], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 50 * 1024 * 1024,
    });
    tracked = out.split('\n').filter(Boolean);
  } catch {
    return { files: [], skippedBinary: 0, skippedLarge: 0, skippedOverCap: 0, isGitRepo: false };
  }

  const files: string[] = [];
  let skippedBinary = 0;
  let skippedLarge = 0;
  let skippedOverCap = 0;

  for (const rel of tracked) {
    if (files.length >= maxFiles) {
      skippedOverCap = tracked.length - tracked.indexOf(rel);
      break;
    }

    const abs = join(projectDir, rel);
    const ext = extname(rel).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      skippedBinary++;
      continue;
    }

    let size: number;
    try {
      size = statSync(abs).size;
    } catch {
      continue;
    }
    if (size > maxBytes) {
      skippedLarge++;
      continue;
    }

    if (looksBinary(abs)) {
      skippedBinary++;
      continue;
    }

    files.push(rel);
  }

  return { files, skippedBinary, skippedLarge, skippedOverCap, isGitRepo: true };
}

export function languageFromPath(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return LANGUAGE_BY_EXT[ext] ?? null;
}

export function readFileSafe(absPath: string): string | null {
  try {
    return readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
}

function looksBinary(absPath: string): boolean {
  try {
    const fd = readFileSync(absPath);
    const sample = fd.subarray(0, Math.min(512, fd.length));
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) return true;
    }
    return false;
  } catch {
    return true;
  }
}
