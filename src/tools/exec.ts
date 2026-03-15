import { execSync } from 'node:child_process';
import type { ToolDefinition } from './types.js';
import { getProjectDir } from '../config/workspace.js';

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

  async execute(args) {
    const command = args.command as string;
    const cwd = (args.cwd as string) || getProjectDir();
    const timeout = (args.timeout as number) || 30000;

    try {
      const output = execSync(command, {
        cwd,
        timeout,
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TERM: 'dumb',
          NO_COLOR: '1',
        },
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

/**
 * Strip ANSI escape sequences from output.
 */
function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\].*?\x07/g, '');
}
