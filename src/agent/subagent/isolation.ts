import { getConfig } from '../../config/index.js';
import { getProjectDir } from '../../config/workspace.js';
import { createWorktree, removeWorktree, mergeWorktree, isGitRepo, type Worktree } from '../worktree.js';
import type { ToolContext } from '../../tools/types.js';

export interface IsolationSetup {
  worktree: Worktree | null;
  toolContext: ToolContext;
}

export function setupIsolation(taskId: string): IsolationSetup {
  const config = getConfig();
  if (config.acpWorktreeIsolation && isGitRepo()) {
    try {
      const worktree = createWorktree(taskId);
      return {
        worktree,
        toolContext: {
          projectDir: worktree.path,
          isWorktree: true,
          worktreeId: worktree.id,
        },
      };
    } catch {
      /* fall through to non-isolated */
    }
  }
  return {
    worktree: null,
    toolContext: {
      projectDir: getProjectDir(),
      isWorktree: false,
    },
  };
}

export async function finalizeWorktree(worktree: Worktree | null): Promise<string> {
  if (!worktree) return '';
  let mergeInfo = '';
  try {
    const mergeResult = await mergeWorktree(worktree);
    if (mergeResult.merged) {
      mergeInfo = `\n[Worktree merged: ${mergeResult.commitSha?.slice(0, 8)}]`;
    } else if (mergeResult.reason === 'conflict') {
      mergeInfo = `\n[⚠️ Merge conflict — changes preserved on branch ${mergeResult.branch}]`;
    } else {
      mergeInfo = '\n[No file changes in worktree]';
    }
  } catch {
    mergeInfo = '\n[⚠️ Worktree merge failed]';
  }
  removeWorktree(worktree);
  return mergeInfo;
}

export function teardownWorktree(worktree: Worktree | null): void {
  if (worktree) removeWorktree(worktree);
}
