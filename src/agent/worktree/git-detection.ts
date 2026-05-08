import { execSync } from 'node:child_process';
import { getProjectDir } from '../../config/workspace.js';

export function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: getProjectDir(),
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

export function getCurrentBranch(): string {
  return execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: getProjectDir(),
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}
