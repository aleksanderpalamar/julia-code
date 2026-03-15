import { readFileSync, writeFileSync } from 'node:fs';
import type { ToolDefinition } from './types.js';
import { resolveInProject } from '../config/workspace.js';

export const editTool: ToolDefinition = {
  name: 'edit',
  description: 'Edit a file by replacing an exact string match with new content. The old_string must appear exactly once in the file.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit',
      },
      old_string: {
        type: 'string',
        description: 'The exact string to find and replace (must be unique in the file)',
      },
      new_string: {
        type: 'string',
        description: 'The replacement string',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences instead of requiring uniqueness (default: false)',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  },

  async execute(args) {
    const filePath = resolveInProject(args.path as string);
    const oldStr = args.old_string as string;
    const newStr = args.new_string as string;
    const replaceAll = (args.replace_all as boolean) || false;

    try {
      const content = readFileSync(filePath, 'utf-8');

      if (!replaceAll) {
        const count = content.split(oldStr).length - 1;
        if (count === 0) {
          return { success: false, output: '', error: 'old_string not found in file' };
        }
        if (count > 1) {
          return { success: false, output: '', error: `old_string found ${count} times — must be unique. Provide more context.` };
        }
      }

      const updated = replaceAll
        ? content.replaceAll(oldStr, newStr)
        : content.replace(oldStr, newStr);

      writeFileSync(filePath, updated, 'utf-8');
      return { success: true, output: `File edited: ${filePath}` };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
