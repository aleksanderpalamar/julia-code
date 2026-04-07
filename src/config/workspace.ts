import { mkdirSync } from 'node:fs';
import { resolve, sep, join } from 'node:path';
import { homedir } from 'node:os';
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
