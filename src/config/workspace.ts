import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getConfig } from './index.js';

let _workspace: string | null = null;

const _projectDir: string = process.cwd();

export function initWorkspace(): string {
  const config = getConfig();
  _workspace = config.workspace
    ? resolve(config.workspace)
    : _projectDir;

  mkdirSync(_workspace, { recursive: true });
  return _workspace;
}

export function getWorkspace(): string {
  if (!_workspace) return initWorkspace();
  return _workspace;
}

export function getProjectDir(): string {
  return _projectDir;
}

