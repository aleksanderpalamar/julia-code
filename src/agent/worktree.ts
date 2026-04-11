import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectDir } from '../config/workspace.js';
import { Mutex } from './mutex.js';

export interface Worktree {
  id: string;
  path: string;
  branch: string;
  baseBranch: string;
  createdAt: Date;
}

export interface MergeResult {
  merged: boolean;
  reason?: 'no-changes' | 'conflict';
  commitSha?: string;
  branch?: string;
}

const mergeLock = new Mutex();

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

export async function mergeWorktree(worktree: Worktree): Promise<MergeResult> {
  const commitSha = commitWorktreeChanges(worktree, `subagent: ${worktree.id}`);

  if (!commitSha) {
    return { merged: false, reason: 'no-changes' };
  }

  return await mergeLock.acquire(async () => {
    try {
      execSync(
        `git merge "${worktree.branch}" --no-ff -m "merge: subagent/${worktree.id}"`,
        { cwd: getProjectDir(), stdio: 'pipe' },
      );
      return { merged: true, commitSha };
    } catch {
      execSync('git merge --abort', {
        cwd: getProjectDir(),
        stdio: 'pipe',
      });
      return { merged: false, reason: 'conflict', commitSha, branch: worktree.branch };
    }
  });
}

export function cleanupOrphanedWorktrees(): void {
  try {
    const output = execSync('git worktree list --porcelain', {
      cwd: getProjectDir(),
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const lines = output.split('\n');
    for (const line of lines) {
      if (line.startsWith('worktree ') && line.includes('juju-wt-')) {
        const wtPath = line.replace('worktree ', '');
        try {
          execSync(`git worktree remove "${wtPath}" --force`, {
            cwd: getProjectDir(),
            stdio: 'pipe',
          });
        } catch { /* ignore */ }
      }
    }

    execSync('git worktree prune', {
      cwd: getProjectDir(),
      stdio: 'pipe',
    });

    const branches = execSync('git branch --list "subagent/*"', {
      cwd: getProjectDir(),
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    if (branches) {
      for (const branch of branches.split('\n')) {
        const name = branch.trim();
        if (name) {
          try {
            execSync(`git branch -D "${name}"`, {
              cwd: getProjectDir(),
              stdio: 'pipe',
            });
          } catch { /* ignore */ }
        }
      }
    }
  } catch { /* not a git repo, ignore */ }
}
