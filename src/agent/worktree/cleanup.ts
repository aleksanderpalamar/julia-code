import { execSync } from 'node:child_process';
import { getProjectDir } from '../../config/workspace.js';

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
