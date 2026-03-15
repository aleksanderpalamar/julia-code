import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
 * Resolve a path relative to the project directory.
 * Absolute paths are returned as-is, relative paths are resolved against project dir.
 */
export function resolveInProject(path: string): string {
  if (path.startsWith('/')) return path;
  return resolve(_projectDir, path);
}

/**
 * Resolve a path relative to the workspace.
 * Absolute paths are returned as-is, relative paths are resolved against workspace.
 */
export function resolveInWorkspace(path: string): string {
  if (path.startsWith('/')) return path;
  return resolve(getWorkspace(), path);
}
