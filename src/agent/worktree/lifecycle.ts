import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectDir } from '../../config/workspace.js';
import { getCurrentBranch } from './git-detection.js';
import type { Worktree } from './types.js';

export function createWorktree(taskId: string): Worktree {
  const id = taskId.slice(0, 12);
  const wtPath = join(tmpdir(), `juju-wt-${id}`);
  const branch = `subagent/${id}`;
  const baseBranch = getCurrentBranch();

  execSync(`git worktree add "${wtPath}" -b "${branch}"`, {
    cwd: getProjectDir(),
    stdio: 'pipe',
    timeout: 30000,
  });

  return {
    id,
    path: wtPath,
    branch,
    baseBranch,
    createdAt: new Date(),
  };
}

export function removeWorktree(worktree: Worktree): void {
  try {
    execSync(`git worktree remove "${worktree.path}" --force`, {
      cwd: getProjectDir(),
      stdio: 'pipe',
      timeout: 15000,
    });
  } catch {
    try {
      execSync('git worktree prune', {
        cwd: getProjectDir(),
        stdio: 'pipe',
      });
    } catch { /* ignore */ }
  }

  try {
    execSync(`git branch -D "${worktree.branch}"`, {
      cwd: getProjectDir(),
      stdio: 'pipe',
    });
  } catch { /* branch may already be removed */ }
}
