import path from 'node:path';
import os from 'node:os';
import { getProjectDir, getWorkspace } from '../config/workspace.js';

/**
 * Denylist of sensitive paths that should never be accessed by tools.
 */
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

/**
 * System paths that should never be written to.
 */
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

/**
 * Check if a resolved path is in the denylist of sensitive locations.
 */
export function isDeniedPath(resolvedPath: string): boolean {
  for (const pattern of DENIED_PATH_PATTERNS) {
    if (pattern.test(resolvedPath)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a resolved path is in a system location that should not be written to.
 */
export function isSystemPath(resolvedPath: string): boolean {
  for (const pattern of SYSTEM_WRITE_DENIED) {
    if (pattern.test(resolvedPath)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate a path for read access.
 * Ensures the path is within allowed boundaries and not in the denylist.
 */
export function validateReadPath(inputPath: string): string {
  const resolved = resolveAndContain(inputPath);

  if (isDeniedPath(resolved)) {
    throw new Error(`Acesso negado: "${inputPath}" é um caminho sensível protegido`);
  }

  return resolved;
}

/**
 * Validate a path for write access.
 * Applies all read validations plus system path restrictions.
 */
export function validateWritePath(inputPath: string): string {
  const resolved = validateReadPath(inputPath);

  if (isSystemPath(resolved)) {
    throw new Error(`Acesso negado: não é permitido escrever em "${inputPath}" (caminho de sistema)`);
  }

  return resolved;
}

/**
 * Resolve a path and ensure it's within allowed boundaries.
 * Allowed: project directory, juliacode home, workspace.
 */
function resolveAndContain(inputPath: string): string {
  const projectDir = getProjectDir();
  const juliaHome = path.join(os.homedir(), '.juliacode');
  const workspace = getWorkspace();

  // Resolve relative to project dir
  const resolved = path.resolve(projectDir, inputPath);

  // Check containment
  if (
    isWithin(resolved, projectDir) ||
    isWithin(resolved, juliaHome) ||
    isWithin(resolved, workspace)
  ) {
    return resolved;
  }

  throw new Error(`Acesso negado: "${inputPath}" está fora do diretório do projeto`);
}

/**
 * Check if a path is within a given directory (or is the directory itself).
 */
function isWithin(filePath: string, dir: string): boolean {
  return filePath === dir || filePath.startsWith(dir + path.sep);
}
