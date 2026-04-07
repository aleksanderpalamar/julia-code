import { minimatch } from 'minimatch';

export type RiskLevel = 'safe' | 'moderate' | 'dangerous';

export const TOOL_RISK: Record<string, RiskLevel> = {
  read: 'safe',
  glob: 'safe',
  grep: 'safe',
  sessions: 'safe',
  memory: 'moderate',
  fetch: 'moderate',
  write: 'dangerous',
  edit: 'dangerous',
  exec: 'dangerous',
  subagent: 'dangerous',
};

export function getToolRisk(toolName: string): RiskLevel {
  if (toolName.startsWith('mcp__')) return 'dangerous';
  return TOOL_RISK[toolName] ?? 'dangerous';
}

const BLOCKED_COMMANDS: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\/\s*$/,  // rm -rf /
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*\s+-[a-zA-Z]*f[a-zA-Z]*\s+\/\s*$/,         // rm -rf /
  /:(){ :\|:& };:/,                         // fork bomb
  /\bcurl\b.*\|\s*(sudo\s+)?(ba)?sh\b/,    // curl | sh
  /\bwget\b.*\|\s*(sudo\s+)?(ba)?sh\b/,    // wget | sh
  /\beval\s*\(\s*["'`]/,                    // eval("...
  /\bmkfs\./,                               // mkfs.*
  /\bdd\s+.*of=\/dev\//,                    // dd of=/dev/*
  /\bchmod\s+(-[a-zA-Z]*\s+)?[0-7]*777\s+\//,  // chmod 777 /
  />\s*\/dev\/sd[a-z]/,                     // write to disk device
  /\bnpm\s+publish\b/,                      // npm publish (without explicit intent)
];

export function isBlockedCommand(command: string): boolean {
  return BLOCKED_COMMANDS.some(pattern => pattern.test(command));
}

export const SAFE_ENV_VARS = [
  'PATH', 'HOME', 'USER', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'TERM', 'NO_COLOR', 'EDITOR', 'VISUAL', 'TZ', 'TMPDIR',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR',
  'NODE_ENV', 'NPM_CONFIG_PREFIX',
];

export function buildSafeEnv(extra?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of SAFE_ENV_VARS) {
    if (process.env[key]) {
      env[key] = process.env[key]!;
    }
  }

  if (extra) {
    Object.assign(env, extra);
  }

  env.TERM = 'dumb';
  env.NO_COLOR = '1';

  return env;
}

export interface AllowRule {
  tool: string;
  pattern: string;
}

export function matchesAllowRule(toolName: string, args: Record<string, unknown>, rules: AllowRule[]): boolean {
  for (const rule of rules) {
    if (rule.tool !== toolName) continue;

    if (toolName === 'exec') {
      const command = args.command as string;
      if (command && minimatch(command, rule.pattern)) return true;
    }

    if (toolName === 'write' || toolName === 'edit') {
      const path = args.path as string;
      if (path && minimatch(path, rule.pattern)) return true;
    }

    if (toolName === 'fetch') {
      const url = args.url as string;
      if (url && minimatch(url, rule.pattern)) return true;
    }
  }

  return false;
}
