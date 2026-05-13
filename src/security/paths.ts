import path from 'node:path';
import os from 'node:os';
import { getWorkspace } from '../config/workspace.js';
import { getActiveToolContext } from '../tools/registry.js';

const DENIED_PATH_PATTERNS: RegExp[] = [
  /\/\.ssh\//,
  /\/\.ssh$/,
  /\/\.gnupg\//,
  /\/\.gnupg$/,
  /\/\.aws\//,
  /\/\.aws$/,
  /\/\.docker\//,
  /\/\.docker$/,
  /\/\.kube\//,
  /\/\.kube$/,
  /\/\.npmrc$/,
  /\/\.env$/,
  /\/\.env\./,
  /\/credentials/i,
  /\/\.netrc$/,
  /\/\.pgpass$/,
  /\/\.my\.cnf$/,
  /\/\.git-credentials$/,
  /\/\.config\/gh\//,
];

const JULIA_SETTINGS_PATH = path.resolve(os.homedir(), '.juliacode', 'settings.json');

const SYSTEM_WRITE_DENIED: RegExp[] = [
  /^\/etc\//,
  /^\/usr\//,
  /^\/bin\//,
  /^\/sbin\//,
  /^\/boot\//,
  /^\/sys\//,
  /^\/proc\//,
  /^\/dev\//,
  /^\/var\/log\//,
];

function isDeniedPath(resolvedPath: string): boolean {
  for (const pattern of DENIED_PATH_PATTERNS) {
    if (pattern.test(resolvedPath)) {
      return true;
    }
  }
  return false;
}

function isSystemPath(resolvedPath: string): boolean {
  for (const pattern of SYSTEM_WRITE_DENIED) {
    if (pattern.test(resolvedPath)) {
      return true;
    }
  }
  return false;
}

export function validateReadPath(inputPath: string): string {
  const resolved = resolveAndContain(inputPath);

  if (isDeniedPath(resolved)) {
    throw new Error(`Access denied: "${inputPath}" It is a protected, sensitive path.`);
  }

  return resolved;
}

export function validateWritePath(inputPath: string): string {
  const resolved = validateReadPath(inputPath);

  if (isSystemPath(resolved)) {
    throw new Error(`Access denied: writing in is not allowed "${inputPath}" (system path)`);
  }

  if (resolved === JULIA_SETTINGS_PATH) {
    throw new Error(
      `Access denied: "~/.juliacode/settings.json" It is managed by Julia herself via slash commands. (/mcp, /model, /trust). Edição direta via write/edit é bloqueada para evitar perda de campos.`
    );
  }

  return resolved;
}

function resolveAndContain(inputPath: string): string {
  const projectDir = getActiveToolContext().projectDir;
  const juliaHome = path.join(os.homedir(), '.juliacode');
  const workspace = getWorkspace();

  const resolved = path.resolve(projectDir, inputPath);

  if (
    isWithin(resolved, projectDir) ||
    isWithin(resolved, juliaHome) ||
    isWithin(resolved, workspace)
  ) {
    return resolved;
  }

  throw new Error(`Access denied: "${inputPath}" It's outside the project directory.`);
}

function isWithin(filePath: string, dir: string): boolean {
  return filePath === dir || filePath.startsWith(dir + path.sep);
}
