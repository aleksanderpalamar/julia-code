export type { Worktree, MergeResult } from './worktree/types.js';
export { isGitRepo, getCurrentBranch } from './worktree/git-detection.js';
export { createWorktree, removeWorktree } from './worktree/lifecycle.js';
export { worktreeHasChanges, commitWorktreeChanges } from './worktree/changes.js';
export { mergeWorktree } from './worktree/merge.js';
export { cleanupOrphanedWorktrees } from './worktree/cleanup.js';
