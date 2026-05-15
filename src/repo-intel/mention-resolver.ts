import { readFileSync, statSync } from 'node:fs';
import { resolve, isAbsolute, normalize, relative } from 'node:path';
import { getProjectDir } from '../config/workspace.js';
import { getAllFilePaths } from './storage.js';
import { fuzzyRank } from './fuzzy.js';

const MENTION_RE = /(?:^|[\s(\[])@([a-zA-Z0-9_./\-]+)/g;
const FENCED_BLOCK_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;

const MAX_FILE_BYTES = 50 * 1024;
const FUZZY_THRESHOLD = 0.7;

export interface ResolvedMention {
  raw: string;
  absolutePath: string;
  relativePath: string;
  content: string;
  truncated: boolean;
  fuzzyMatched: boolean;
}

export interface MentionResolutionResult {
  resolved: ResolvedMention[];
  errors: string[];
}

export function parseMentions(text: string): string[] {
  if (!text.includes('@')) return [];
  const stripped = text.replace(FENCED_BLOCK_RE, ' ').replace(INLINE_CODE_RE, ' ');
  const out = new Set<string>();
  let match: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(stripped)) !== null) {
    const token = match[1];
    if (token.length === 0) continue;
    if (token.includes('@')) continue;
    out.add(token);
  }
  return [...out];
}

export async function resolveMentionsInPrompt(text: string): Promise<MentionResolutionResult> {
  const mentions = parseMentions(text);
  if (mentions.length === 0) return { resolved: [], errors: [] };

  const projectDir = getProjectDir();
  const resolved: ResolvedMention[] = [];
  const errors: string[] = [];

  for (const raw of mentions) {
    const result = resolveOne(raw, projectDir);
    if (result.ok) {
      resolved.push(result.mention);
    } else {
      errors.push(`[mention] @${raw}: ${result.reason}`);
    }
  }

  return { resolved, errors };
}

type ResolveOneResult =
  | { ok: true; mention: ResolvedMention }
  | { ok: false; reason: string };

function resolveOne(raw: string, projectDir: string): ResolveOneResult {
  if (isAbsolute(raw)) {
    return { ok: false, reason: 'absolute paths not allowed' };
  }
  const normalized = normalize(raw);
  if (normalized.startsWith('..')) {
    return { ok: false, reason: 'parent-directory traversal not allowed' };
  }

  const direct = tryRead(resolve(projectDir, normalized), projectDir, raw, false);
  if (direct.ok) return direct;
  if (direct.reason !== 'not found') return direct;

  const indexed = getAllFilePaths();
  if (indexed.length > 0) {
    const ranked = fuzzyRank(raw, indexed, 1);
    if (ranked.length > 0 && ranked[0].score >= FUZZY_THRESHOLD) {
      const target = ranked[0].value;
      const fuzzy = tryRead(resolve(projectDir, target), projectDir, raw, true);
      if (fuzzy.ok) return fuzzy;
    }
  }
  return { ok: false, reason: 'not found' };
}

function tryRead(
  absolute: string,
  projectDir: string,
  raw: string,
  fuzzyMatched: boolean,
): ResolveOneResult {
  const rel = relative(projectDir, absolute);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return { ok: false, reason: 'path escapes project directory' };
  }
  let size: number;
  try {
    const stat = statSync(absolute);
    if (!stat.isFile()) return { ok: false, reason: 'not a file' };
    size = stat.size;
  } catch {
    return { ok: false, reason: 'not found' };
  }

  let buffer: Buffer;
  try {
    buffer = readFileSync(absolute);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  const sample = buffer.subarray(0, Math.min(512, buffer.length));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return { ok: false, reason: 'binary file' };
  }

  let content: string;
  let truncated = false;
  if (size > MAX_FILE_BYTES) {
    content = buffer.subarray(0, MAX_FILE_BYTES).toString('utf-8');
    truncated = true;
  } else {
    content = buffer.toString('utf-8');
  }

  return {
    ok: true,
    mention: {
      raw,
      absolutePath: absolute,
      relativePath: rel || raw,
      content,
      truncated,
      fuzzyMatched,
    },
  };
}

export function buildMentionContextBlock(mentions: ResolvedMention[]): string {
  if (mentions.length === 0) return '';
  const sections: string[] = ['## Files mentioned in user prompt'];
  for (const m of mentions) {
    const fence = inferFence(m.relativePath);
    const header = m.fuzzyMatched
      ? `### ${m.relativePath} (resolved from @${m.raw})`
      : `### ${m.relativePath}`;
    sections.push(header);
    const trunc = m.truncated ? '\n... [truncated]' : '';
    sections.push('```' + fence + '\n' + m.content + trunc + '\n```');
  }
  return sections.join('\n\n');
}

function inferFence(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
    php: 'php', lua: 'lua', sh: 'bash', bash: 'bash',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', sql: 'sql', html: 'html', css: 'css',
  };
  return map[ext] ?? '';
}
