export type { Worktree } from './worktree/types.js';
export { isGitRepo } from './worktree/git-detection.js';
export { createWorktree, removeWorktree } from './worktree/lifecycle.js';
export { mergeWorktree } from './worktree/merge.js';
export { cleanupOrphanedWorktrees } from './worktree/cleanup.js';
