import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
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
      // Use find with basic glob support via shell
      const output = execSync(
        `find . -path './${pattern}' -o -name '${pattern}' 2>/dev/null | head -200 | sort`,
        { cwd, encoding: 'utf-8', timeout: 10000 }
      ).trim();

      if (!output) {
        return { success: true, output: 'No files found matching pattern.' };
      }

      return { success: true, output };
    } catch {
      // Fallback: use ls with globbing
      try {
        const output = execSync(
          `ls -1 ${pattern} 2>/dev/null | head -200`,
          { cwd, encoding: 'utf-8', timeout: 10000, shell: '/bin/bash' }
        ).trim();

        return { success: true, output: output || 'No files found matching pattern.' };
      } catch {
        return { success: true, output: 'No files found matching pattern.' };
      }
    }
  },
};
