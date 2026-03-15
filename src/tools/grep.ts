import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { ToolDefinition } from './types.js';
import { resolveInProject } from '../config/workspace.js';

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

  async execute(args) {
    const pattern = args.pattern as string;
    const searchPath = resolveInProject((args.path as string) || '.');
    const ignoreCase = (args.ignore_case as boolean) ? '-i' : '';
    const includeGlob = (args.glob as string) ? `--include='${args.glob}'` : '';

    try {
      const output = execSync(
        `grep -rn ${ignoreCase} ${includeGlob} -- ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)} 2>/dev/null | head -100`,
        { encoding: 'utf-8', timeout: 15000, shell: '/bin/bash' }
      ).trim();

      return { success: true, output: output || 'No matches found.' };
    } catch {
      return { success: true, output: 'No matches found.' };
    }
  },
};
