import { execSync } from 'node:child_process';
import type { ToolDefinition } from './types.js';
import { getActiveToolContext } from './registry.js';
import { buildSafeEnv } from '../security/permissions.js';
import { stripAnsi } from '../util/ansi.js';

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

    if (/(^|[\s;&|`$(])juju\b/.test(command)) {
      return {
        success: false,
        output: '',
        error:
          "Command blocked: cannot be executed. `juju` as a subprocess. This triggers Julia's bootstrap in a child without a TTY, which rewrites ~/.juliacode/settings.json (losing mcpServers and trustedDirectories) and crashes with \"Raw mode is not supported\". Use the TUI slash commands (/mcp, /model, /trust) or have the user run it manually.",
      };
    }

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
