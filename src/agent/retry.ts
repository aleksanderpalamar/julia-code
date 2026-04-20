import { executeTool } from '../tools/registry.js';

export interface DeterministicRetryResult {
  attempted: string;
  hint: string;
}

const NOT_FOUND_PATTERNS: RegExp[] = [
  /no such file or directory/i,
  /\benoent\b/i,
  /\bnot found\b/i,
];

const PATH_ARG_KEYS = ['path', 'file', 'filepath', 'file_path'] as const;

function errorSuggestsMissingPath(error: string): boolean {
  return NOT_FOUND_PATTERNS.some(p => p.test(error));
}

function pickPathArg(args: Record<string, unknown>): string | null {
  for (const key of PATH_ARG_KEYS) {
    const v = args[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

function basenameOf(p: string): string {
  const segs = p.split(/[\\/]/);
  return segs[segs.length - 1] ?? p;
}

function looksLikeGlobPattern(s: string): boolean {
  return /[*?[\]]/.test(s);
}

export async function maybeDeterministicRetry(
  error: string,
  args: Record<string, unknown>,
): Promise<DeterministicRetryResult | null> {
  if (!errorSuggestsMissingPath(error)) return null;

  const rawPath = pickPathArg(args);
  if (!rawPath) return null;

  const base = basenameOf(rawPath);
  if (!base || looksLikeGlobPattern(base)) return null;

  const pattern = `**/${base}`;
  const probe = await executeTool('glob', { pattern });
  if (!probe.success) return null;

  const output = (probe.output ?? '').trim();
  if (!output || output.startsWith('No files found')) return null;

  const trimmed = output.slice(0, 1000);
  return {
    attempted: `glob(pattern=${JSON.stringify(pattern)})`,
    hint:
      `\n\n[deterministic retry] Path "${rawPath}" was not found. ` +
      `Similar files in the project:\n${trimmed}`,
  };
}
