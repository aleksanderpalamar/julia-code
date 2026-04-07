import { readFileSync } from 'node:fs';
import type { ToolDefinition } from './types.js';
import { validateReadPath } from '../security/paths.js';

export const readTool: ToolDefinition = {
  name: 'read',
  description: 'Read the contents of a file. Returns the file content as text with line numbers. For large files (200+ lines), use offset and limit to read in sections instead of loading everything at once.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read (relative to project directory)',
      },
      offset: {
        type: 'number',
        description: 'Line number to start reading from (1-based)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read',
      },
    },
    required: ['path'],
  },

  async execute(args) {
    const filePath = validateReadPath(args.path as string);

    try {
      const content = readFileSync(filePath, 'utf-8');
      const allLines = content.split('\n');
      const totalLines = allLines.length;

      const offset = (args.offset as number) || 1;
      const limit = args.limit as number | undefined;

      const AUTO_LIMIT = 200;
      const effectiveLimit = limit ?? (totalLines > AUTO_LIMIT && offset === 1 ? AUTO_LIMIT : undefined);

      let lines = allLines;
      let wasAutoTruncated = false;

      if (offset > 1 || effectiveLimit) {
        const start = offset - 1;
        lines = allLines.slice(start, effectiveLimit ? start + effectiveLimit : undefined);
        wasAutoTruncated = !limit && effectiveLimit === AUTO_LIMIT && totalLines > AUTO_LIMIT;
      }

      const startLine = offset;
      const numbered = lines.map((line, i) => `${startLine + i}\t${line}`).join('\n');

      const header = wasAutoTruncated
        ? `[file: ${filePath} | lines: ${startLine}-${startLine + lines.length - 1} of ${totalLines} — use offset/limit to read more]\n`
        : totalLines > AUTO_LIMIT
          ? `[file: ${filePath} | showing lines ${startLine}-${startLine + lines.length - 1} of ${totalLines}]\n`
          : '';

      return { success: true, output: header + numbered };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
