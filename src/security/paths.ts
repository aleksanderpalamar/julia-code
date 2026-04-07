import path from 'node:path';
import os from 'node:os';
import { getProjectDir, getWorkspace } from '../config/workspace.js';

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

export function isDeniedPath(resolvedPath: string): boolean {
  for (const pattern of DENIED_PATH_PATTERNS) {
    if (pattern.test(resolvedPath)) {
      return true;
    }
  }
  return false;
}

export function isSystemPath(resolvedPath: string): boolean {
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
    throw new Error(`Acesso negado: "${inputPath}" é um caminho sensível protegido`);
  }

  return resolved;
}

export function validateWritePath(inputPath: string): string {
  const resolved = validateReadPath(inputPath);

  if (isSystemPath(resolved)) {
    throw new Error(`Acesso negado: não é permitido escrever em "${inputPath}" (caminho de sistema)`);
  }

  return resolved;
}

function resolveAndContain(inputPath: string): string {
  const projectDir = getProjectDir();
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

  throw new Error(`Acesso negado: "${inputPath}" está fora do diretório do projeto`);
}

function isWithin(filePath: string, dir: string): boolean {
  return filePath === dir || filePath.startsWith(dir + path.sep);
}
