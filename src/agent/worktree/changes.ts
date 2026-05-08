import { execSync } from 'node:child_process';
import type { Worktree } from './types.js';

export function worktreeHasChanges(worktree: Worktree): boolean {
  const status = execSync('git status --porcelain', {
    cwd: worktree.path,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
  return status.length > 0;
}

export function commitWorktreeChanges(worktree: Worktree, message: string): string | null {
  if (!worktreeHasChanges(worktree)) return null;

  execSync('git add -A', { cwd: worktree.path, stdio: 'pipe' });
  execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
    cwd: worktree.path,
    stdio: 'pipe',
  });

  return execSync('git rev-parse HEAD', {
    cwd: worktree.path,
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}
