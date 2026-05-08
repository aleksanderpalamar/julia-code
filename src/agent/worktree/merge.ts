import { execSync } from 'node:child_process';
import { getProjectDir } from '../../config/workspace.js';
import { Mutex } from '../mutex.js';
import { commitWorktreeChanges } from './changes.js';
import type { Worktree, MergeResult } from './types.js';

const mergeLock = new Mutex();

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
