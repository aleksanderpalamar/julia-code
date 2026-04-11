import { execSync } from 'node:child_process';
import type { ToolDefinition, ToolContext } from './types.js';
import { getActiveToolContext } from './registry.js';
import { buildSafeEnv } from '../security/permissions.js';

export const execTool: ToolDefinition = {
  name: 'exec',
  description: 'Execute a shell command and return stdout/stderr. Use for system commands, git, package managers, etc.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      cwd: {
        type: 'string',
        description: 'Working directory (defaults to current directory)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
      },
    },
    required: ['command'],
  },

  async execute(args, context?) {
    const ctx = context ?? getActiveToolContext();
    const command = args.command as string;
    const cwd = (args.cwd as string) || ctx.projectDir;
    const timeout = (args.timeout as number) || 30000;

    try {
      const output = execSync(command, {
        cwd,
        timeout,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: buildSafeEnv(),
      });

      return { success: true, output: stripAnsi(output.trim()) };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message: string };
      const output = [e.stdout, e.stderr].filter(Boolean).join('\n').trim();
      return {
        success: false,
        output: stripAnsi(output || e.message),
        error: e.message,
      };
    }
  },
};

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\].*?\x07/g, '');
}
