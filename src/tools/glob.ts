import { readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { minimatch } from 'minimatch';
import type { ToolDefinition } from './types.js';
import { getProjectDir } from '../config/workspace.js';

export const globTool: ToolDefinition = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Returns a list of file paths.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.tsx")',
      },
      cwd: {
        type: 'string',
        description: 'Directory to search in (defaults to current directory)',
      },
    },
    required: ['pattern'],
  },

  async execute(args) {
    const pattern = args.pattern as string;
    const cwd = resolve((args.cwd as string) || getProjectDir());

    try {
      const matches = await findMatches(cwd, pattern);

      if (matches.length === 0) {
        return { success: true, output: 'No files found matching pattern.' };
      }

      // Sort and limit to 200 results
      matches.sort();
      const limited = matches.slice(0, 200);
      const output = limited.join('\n')
        + (matches.length > 200 ? `\n... (${matches.length - 200} more files)` : '');

      return { success: true, output };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

/**
 * Recursively find files matching a glob pattern using native Node.js APIs.
 * No shell execution — safe from injection.
 */
async function findMatches(root: string, pattern: string, maxDepth = 20): Promise<string[]> {
  const results: string[] = [];
  const MAX_RESULTS = 500;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || results.length >= MAX_RESULTS) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // Skip unreadable directories
    }

    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) break;

      const fullPath = resolve(dir, entry.name);
      const relPath = relative(root, fullPath);

      // Skip hidden directories like .git
      if (entry.isDirectory() && entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
      }

      if (minimatch(relPath, pattern, { dot: false, matchBase: !pattern.includes('/') })) {
        results.push(relPath);
      }
    }
  }

  await walk(root, 0);
  return results;
}
