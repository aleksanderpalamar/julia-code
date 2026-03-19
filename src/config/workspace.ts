import { mkdirSync } from 'node:fs';
import { resolve, sep, join } from 'node:path';
import { homedir } from 'node:os';
import { getConfig } from './index.js';

let _workspace: string | null = null;

// Capture the directory where juju was invoked (the user's project)
const _projectDir: string = process.cwd();

/**
 * Initialize workspace directory. Creates it if it doesn't exist.
 * Returns the absolute workspace path.
 */
export function initWorkspace(): string {
  const config = getConfig();
  _workspace = config.workspace
    ? resolve(config.workspace)
    : _projectDir;

  mkdirSync(_workspace, { recursive: true });
  return _workspace;
}

/**
 * Get the current workspace root (Julia's internal config/instruction files).
 */
export function getWorkspace(): string {
  if (!_workspace) return initWorkspace();
  return _workspace;
}

/**
 * Get the project directory where juju was invoked.
 * This is the directory the user is actually working in.
 */
export function getProjectDir(): string {
  return _projectDir;
}

/**
 * Resolve a path relative to the project directory with containment.
 * Ensures the resolved path stays within the project dir or juliacode home.
 * Throws if the path escapes allowed boundaries.
 */
export function resolveInProject(inputPath: string): string {
  const resolved = resolve(_projectDir, inputPath);
  const juliaHome = join(homedir(), '.juliacode');

  if (
    resolved === _projectDir ||
    resolved.startsWith(_projectDir + sep) ||
    resolved.startsWith(juliaHome + sep)
  ) {
    return resolved;
  }

  throw new Error(`Acesso negado: "${inputPath}" está fora do diretório do projeto`);
}

/**
 * Resolve a path relative to the workspace with containment.
 * Ensures the resolved path stays within workspace or juliacode home.
 * Throws if the path escapes allowed boundaries.
 */
export function resolveInWorkspace(inputPath: string): string {
  const workspace = getWorkspace();
  const resolved = resolve(workspace, inputPath);
  const juliaHome = join(homedir(), '.juliacode');

  if (
    resolved === workspace ||
    resolved.startsWith(workspace + sep) ||
    resolved.startsWith(juliaHome + sep)
  ) {
    return resolved;
  }

  throw new Error(`Acesso negado: "${inputPath}" está fora do workspace`);
}
