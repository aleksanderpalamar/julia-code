import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ToolDefinition } from './types.js';
import { resolveInProject } from '../config/workspace.js';

export const writeTool: ToolDefinition = {
  name: 'write',
  description: 'Write content to a file. Creates the file and parent directories if they do not exist. Overwrites existing content.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['path', 'content'],
  },

  async execute(args) {
    const filePath = resolveInProject(args.path as string);
    const content = args.content as string;

    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, 'utf-8');
      return { success: true, output: `Written ${content.length} bytes to ${filePath}` };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
