import { execFileSync } from 'node:child_process';
import type { ToolDefinition } from './types.js';
import { validateReadPath } from '../security/paths.js';

export const grepTool: ToolDefinition = {
  name: 'grep',
  description: 'Search file contents for a pattern using grep. Returns matching lines with file paths and line numbers.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for',
      },
      path: {
        type: 'string',
        description: 'File or directory to search in (defaults to current directory)',
      },
      glob: {
        type: 'string',
        description: 'File glob to filter (e.g., "*.ts")',
      },
      ignore_case: {
        type: 'boolean',
        description: 'Case insensitive search (default: false)',
      },
    },
    required: ['pattern'],
  },

  async execute(args, _context?) {
    const pattern = args.pattern as string;
    const searchPath = validateReadPath((args.path as string) || '.');
    const ignoreCase = args.ignore_case as boolean;
    const glob = args.glob as string | undefined;

    const grepArgs: string[] = ['-rn'];
    if (ignoreCase) grepArgs.push('-i');
    if (glob) grepArgs.push(`--include=${glob}`);
    grepArgs.push('--', pattern, searchPath);

    try {
      const output = execFileSync('grep', grepArgs, {
        encoding: 'utf-8',
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      }).trim();

      const lines = output.split('\n');
      const limited = lines.slice(0, 100);
      const result = limited.join('\n')
        + (lines.length > 100 ? `\n... (${lines.length - 100} more matches)` : '');

      return { success: true, output: result || 'No matches found.' };
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string };
      if (e.status === 1) {
        return { success: true, output: 'No matches found.' };
      }
      return { success: true, output: 'No matches found.' };
    }
  },
};
